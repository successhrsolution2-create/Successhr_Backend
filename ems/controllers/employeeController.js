const bcrypt = require('bcryptjs')
const ExcelJS = require('exceljs')

const Department = require('../models/Department')
const Document = require('../models/Document')
const Employee = require('../models/Employee')
const Attendance = require('../models/Attendance')
const Leave = require('../models/Leave')
const Payroll = require('../models/Payroll')
const WorkSchedule = require('../models/WorkSchedule')
const CrmUser = require('../../crm/models/CrmUser.model')
const User = require('../../models/User')
const { MANAGER_ACCESS_MODULES } = require('../../models/User')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { EMS_ROLES } = require('../config/emsConstants')
const { normalizeEmployeePayload } = require('../validations/employeeValidation')
const { ensureLoginIdentityAvailable } = require('../../utils/loginIdentity')
const {
  buildSearch,
  getNextEmployeeId,
  pagination,
  safeText,
  sendCsv,
  toCsv
} = require('../utils/emsHelpers')

const employeePopulate = [
  { path: 'department', select: 'name code' },
  { path: 'manager', select: 'employeeId firstName lastName email' }
]

const APP_LOGIN_ROLES = ['candidate_admin', 'manager']

const appRoleForEmployeeRole = (role) => {
  if (role === 'candidate_admin') return 'candidateAdmin'
  if (role === 'manager') return 'manager'
  return null
}

const employeeRoleForAppRole = (role) => {
  if (role === 'candidateAdmin') return 'candidate_admin'
  if (role === 'manager') return 'manager'
  return null
}

const employeeFullName = (employee = {}) =>
  employee.fullName ||
  `${employee.firstName || ''} ${employee.lastName || ''}`.trim() ||
  employee.email ||
  'CRM Employee'

const splitName = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts.shift() || 'Login',
    lastName: parts.join(' ') || 'User'
  }
}

const createHttpError = (status, message) => {
  const error = new Error(message)
  error.status = status
  error.statusCode = status
  return error
}

const isDuplicateKeyError = (error) => Number(error?.code) === 11000

const findLegacyMirrorEmployee = (matches = []) =>
  Employee.findOne({ $or: matches }).sort({ isDeleted: 1, updatedAt: -1 })

const deletedEmployeeId = (id) => `DELETED_${String(id).toUpperCase()}_${Date.now()}`
const deletedEmployeeEmail = (id) => `deleted-${String(id).toLowerCase()}-${Date.now()}@deleted.local`
const deletedLoginEmployeeId = (id) => `DELETED_LOGIN_${String(id).toUpperCase()}_${Date.now()}`

const releaseDeletedEmployeeUniqueFields = async ({ employeeId, email, updatedBy }) => {
  const matches = []
  if (employeeId) matches.push({ employeeId })
  if (email) matches.push({ email })
  if (!matches.length) return

  const deletedEmployees = await Employee.find({ isDeleted: true, $or: matches }).select('_id employeeId email')
  for (const employee of deletedEmployees) {
    await Employee.updateOne(
      { _id: employee._id, isDeleted: true },
      {
        $set: {
          employeeId: deletedEmployeeId(employee._id),
          email: deletedEmployeeEmail(employee._id),
          archivedEmployeeId: employee.employeeId,
          archivedEmail: employee.email,
          updatedBy: updatedBy || null
        }
      }
    )
  }
}

const addExcludedId = (exclude, source, id) => {
  if (!id) return
  const current = exclude[source]
  if (!current) {
    exclude[source] = [id]
    return
  }

  if (!current.some((item) => String(item) === String(id))) {
    current.push(id)
  }
}

const canReuseInactiveAppUser = async (user) => {
  if (!user || user.isActive !== false) return false
  const activeEmployee = await Employee.exists({ appUserId: user._id, isDeleted: false })
  return !activeEmployee
}

const canReuseInactiveCrmUser = async (user) => {
  if (!user || user.isActive !== false) return false
  const activeEmployee = await Employee.exists({ crmUserId: user._id, isDeleted: false })
  return !activeEmployee
}

const reusableLoginIdentityExclusions = async (employee) => {
  const exclude = {}
  if (!employee) return exclude

  if (employee.role === 'crm_employee') {
    const reusableCrmUsers = await Promise.all([
      employee.email ? CrmUser.findOne({ email: employee.email }).select('_id isActive') : null,
      employee.employeeId ? CrmUser.findOne({ employeeId: employee.employeeId }).select('_id isActive') : null
    ])

    for (const crmUser of reusableCrmUsers) {
      if (await canReuseInactiveCrmUser(crmUser)) {
        addExcludedId(exclude, 'crmUser', crmUser._id)
      }
    }
  }

  if (APP_LOGIN_ROLES.includes(employee.role)) {
    const reusableAppUsers = await Promise.all([
      employee.email ? User.findOne({ email: employee.email }).select('_id isActive') : null,
      employee.employeeId ? User.findOne({ employeeId: employee.employeeId }).select('_id isActive') : null
    ])

    for (const user of reusableAppUsers) {
      if (await canReuseInactiveAppUser(user)) {
        addExcludedId(exclude, 'user', user._id)
      }
    }
  }

  return exclude
}

const syncCrmEmployeeLogin = async (employee, rawPassword) => {
  if (!employee || employee.role !== 'crm_employee') return

  const existingByEmail = await CrmUser.findOne({ email: employee.email }).select('+password')
  const existingByEmployeeId = employee.employeeId
    ? await CrmUser.findOne({ employeeId: employee.employeeId }).select('+password')
    : null
  const canReuseEmailLogin = await canReuseInactiveCrmUser(existingByEmail)

  if (existingByEmail && existingByEmail.role !== 'crm_employee' && !canReuseEmailLogin) {
    throw createHttpError(409, 'This email is already used by a CRM admin account')
  }

  let crmUser = employee.crmUserId
    ? await CrmUser.findById(employee.crmUserId).select('+password')
    : null

  if (existingByEmail && crmUser && String(existingByEmail._id) !== String(crmUser._id)) {
    throw createHttpError(409, 'This email is already used by another CRM employee login')
  }

  if (!crmUser) crmUser = existingByEmail
  if (existingByEmployeeId && crmUser && String(existingByEmployeeId._id) !== String(crmUser._id)) {
    if (await canReuseInactiveCrmUser(existingByEmployeeId)) {
      await CrmUser.updateOne({ _id: existingByEmployeeId._id }, { $set: { employeeId: deletedLoginEmployeeId(existingByEmployeeId._id) } })
    } else {
      throw createHttpError(409, 'This employee ID is already used by another CRM employee login')
    }
  }
  if (!crmUser && existingByEmployeeId) {
    if (existingByEmployeeId.role !== 'crm_employee' && !(await canReuseInactiveCrmUser(existingByEmployeeId))) {
      throw createHttpError(409, 'This employee ID is already used by another CRM login')
    }
    crmUser = existingByEmployeeId
  }

  if (!crmUser) {
    if (!rawPassword) {
      throw createHttpError(400, 'Temporary password is required for CRM Employee login')
    }

    crmUser = new CrmUser({
      name: employeeFullName(employee),
      email: employee.email,
      employeeId: employee.employeeId,
      password: rawPassword,
      role: 'crm_employee',
      isActive: employee.status === 'active',
      createdBy: employee.createdBy || employee.updatedBy || null
    })
  } else {
    crmUser.name = employeeFullName(employee)
    crmUser.email = employee.email
    crmUser.employeeId = employee.employeeId
    crmUser.role = 'crm_employee'
    crmUser.isActive = employee.status === 'active'

    if (rawPassword) {
      crmUser.password = rawPassword
      crmUser.tokenVersion = Number(crmUser.tokenVersion || 0) + 1
    }
  }

  await crmUser.save()

  if (!employee.crmUserId || String(employee.crmUserId) !== String(crmUser._id)) {
    employee.crmUserId = crmUser._id
    await Employee.updateOne({ _id: employee._id }, { $set: { crmUserId: crmUser._id } })
  }
}

const deactivateCrmEmployeeLogin = async (employee) => {
  if (!employee?.crmUserId) return

  await CrmUser.findByIdAndUpdate(employee.crmUserId, {
    $set: { isActive: false, employeeId: deletedLoginEmployeeId(employee.crmUserId) },
    $inc: { tokenVersion: 1 }
  })
}

const syncAppUserLogin = async (employee, rawPassword) => {
  const appRole = appRoleForEmployeeRole(employee?.role)
  if (!employee || !appRole) return

  const existingByEmail = await User.findOne({ email: employee.email }).select('+password')
  const existingByEmployeeId = employee.employeeId
    ? await User.findOne({ employeeId: employee.employeeId }).select('+password')
    : null
  const linkedToSameUser = employee.appUserId && existingByEmail && String(existingByEmail._id) === String(employee.appUserId)
  const canReuseEmailLogin = await canReuseInactiveAppUser(existingByEmail)
  if (existingByEmail && existingByEmail.role !== appRole && !linkedToSameUser && !canReuseEmailLogin) {
    throw createHttpError(409, 'This email is already used by another login role')
  }

  let appUser = employee.appUserId
    ? await User.findById(employee.appUserId).select('+password')
    : null

  if (existingByEmail && appUser && String(existingByEmail._id) !== String(appUser._id)) {
    throw createHttpError(409, 'This email is already used by another login account')
  }

  if (!appUser) appUser = existingByEmail
  if (existingByEmployeeId && appUser && String(existingByEmployeeId._id) !== String(appUser._id)) {
    if (await canReuseInactiveAppUser(existingByEmployeeId)) {
      await User.updateOne({ _id: existingByEmployeeId._id }, { $set: { employeeId: deletedLoginEmployeeId(existingByEmployeeId._id) } })
    } else {
      throw createHttpError(409, 'This employee ID is already used by another login account')
    }
  }
  if (!appUser && existingByEmployeeId) {
    if (existingByEmployeeId.role !== appRole && !(await canReuseInactiveAppUser(existingByEmployeeId))) {
      throw createHttpError(409, 'This employee ID is already used by another login role')
    }
    appUser = existingByEmployeeId
  }

  if (!appUser) {
    if (!rawPassword) {
      throw createHttpError(400, 'Temporary password is required for this login role')
    }

    appUser = new User({
      name: employeeFullName(employee),
      email: employee.email,
      employeeId: employee.employeeId,
      password: await bcrypt.hash(rawPassword, 12),
      role: appRole,
      isActive: employee.status === 'active',
      managerAccess: appRole === 'manager' ? MANAGER_ACCESS_MODULES : []
    })
  } else {
    appUser.name = employeeFullName(employee)
    appUser.email = employee.email
    appUser.employeeId = employee.employeeId
    appUser.role = appRole
    appUser.isActive = employee.status === 'active'
    appUser.managerAccess = appRole === 'manager' ? MANAGER_ACCESS_MODULES : []
    if (rawPassword) {
      appUser.password = await bcrypt.hash(rawPassword, 12)
      appUser.tokenVersion = Number(appUser.tokenVersion || 0) + 1
    }
  }

  await appUser.save()

  if (!employee.appUserId || String(employee.appUserId) !== String(appUser._id)) {
    employee.appUserId = appUser._id
    await Employee.updateOne({ _id: employee._id }, { $set: { appUserId: appUser._id } })
  }
}

const deactivateAppUserLogin = async (employee) => {
  if (!employee?.appUserId) return

  await User.findByIdAndUpdate(employee.appUserId, {
    $set: { isActive: false, employeeId: deletedLoginEmployeeId(employee.appUserId) },
    $inc: { tokenVersion: 1 }
  })
}

const mirrorLegacyCrmEmployees = async () => {
  const crmUsers = await CrmUser.find({ role: 'crm_employee' }).select('+password').lean()

  for (const crmUser of crmUsers) {
    let employee = await findLegacyMirrorEmployee([
      { crmUserId: crmUser._id },
      { email: crmUser.email }
    ])

    if (employee?.isDeleted) continue

    if (employee && employee.role === 'crm_employee') {
      const updates = {}
      if (!employee.crmUserId) updates.crmUserId = crmUser._id
      if (crmUser.employeeId !== employee.employeeId) {
        await CrmUser.updateOne({ _id: crmUser._id }, { $set: { employeeId: employee.employeeId } })
      }
      if (Object.keys(updates).length) {
        await Employee.updateOne({ _id: employee._id }, { $set: updates })
      }
      continue
    }

    if (employee) continue

    const requestedEmployeeId = crmUser.employeeId || (await getNextEmployeeId())
    const employeeIdTaken = await Employee.exists({ employeeId: requestedEmployeeId })
    const employeeId = employeeIdTaken ? await getNextEmployeeId() : requestedEmployeeId
    const { firstName, lastName } = splitName(crmUser.name)

    try {
      employee = await Employee.create({
        employeeId,
        firstName,
        lastName,
        email: crmUser.email,
        role: 'crm_employee',
        status: crmUser.isActive ? 'active' : 'inactive',
        designation: 'CRM Employee',
        employmentType: 'Full-time',
        crmUserId: crmUser._id,
        createdBy: crmUser.createdBy || null
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) continue
      throw error
    }

    if (crmUser.password) {
      await Employee.updateOne({ _id: employee._id }, { $set: { password: crmUser.password } })
    }

    if (crmUser.employeeId !== employeeId) {
      await CrmUser.updateOne({ _id: crmUser._id }, { $set: { employeeId } })
    }
  }
}

const mirrorLegacyAppRoleUsers = async () => {
  const users = await User.find({ role: { $in: ['candidateAdmin', 'manager'] } }).lean()

  for (const user of users) {
    const employeeRole = employeeRoleForAppRole(user.role)
    if (!employeeRole) continue

    let employee = await findLegacyMirrorEmployee([
      { appUserId: user._id },
      { email: user.email }
    ])

    if (employee?.isDeleted) continue

    if (employee && APP_LOGIN_ROLES.includes(employee.role)) {
      const updates = {}
      if (!employee.appUserId) updates.appUserId = user._id
      if (employee.role !== employeeRole) updates.role = employeeRole
      if (employee.status !== (user.isActive === false ? 'inactive' : 'active')) {
        updates.status = user.isActive === false ? 'inactive' : 'active'
      }
      if (Object.keys(updates).length) {
        await Employee.updateOne({ _id: employee._id }, { $set: updates })
      }
      if (user.employeeId !== employee.employeeId) {
        await User.updateOne({ _id: user._id }, { $set: { employeeId: employee.employeeId } })
      }
      continue
    }

    if (employee) continue

    const { firstName, lastName } = splitName(user.name)
    const employeeId = await getNextEmployeeId()
    let mirroredEmployee
    try {
      mirroredEmployee = await Employee.create({
        employeeId,
        firstName,
        lastName,
        email: user.email,
        role: employeeRole,
        status: user.isActive === false ? 'inactive' : 'active',
        designation: employeeRole === 'candidate_admin' ? 'Candidate Management' : 'Manager',
        employmentType: 'Full-time',
        appUserId: user._id
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) continue
      throw error
    }

    if (user.employeeId !== mirroredEmployee.employeeId) {
      await User.updateOne({ _id: user._id }, { $set: { employeeId: mirroredEmployee.employeeId } })
    }
  }
}

const parseRoleList = (value) => String(value || '')
  .split(',')
  .map((role) => role.trim())
  .filter((role) => EMS_ROLES.includes(role))

const employeeFilter = (query = {}) => {
  const filter = {
    isDeleted: false,
    ...buildSearch(query.search, ['employeeId', 'firstName', 'lastName', 'email', 'phone', 'designation'])
  }
  if (query.department) filter.department = query.department
  if (query.status) filter.status = query.status
  if (query.type) filter.employmentType = query.type
  if (query.role) {
    filter.role = query.role
  } else {
    const roles = parseRoleList(query.roles)
    if (roles.length) filter.role = { $in: roles }
  }
  return filter
}

const listEmployees = async (req, res) => {
  await mirrorLegacyCrmEmployees()
  await mirrorLegacyAppRoleUsers()

  const { page, limit, skip } = pagination(req.query)
  const filter = employeeFilter(req.query)
  const sortField = ['employeeId', 'firstName', 'joiningDate', 'status', 'createdAt'].includes(req.query.sortBy)
    ? req.query.sortBy
    : 'createdAt'
  const sortDirection = req.query.sortOrder === 'asc' ? 1 : -1

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .populate(employeePopulate)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limit),
    Employee.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const createEmployee = async (req, res) => {
  const { payload, errors } = normalizeEmployeePayload(req.body)
  if (errors.length) {
    return res.status(400).json({ message: errors.join(', ') })
  }

  if (payload.role === 'crm_employee' && !payload.password) {
    return res.status(400).json({ message: 'Temporary password is required for CRM Employee login' })
  }
  if (payload.role === 'crm_employee' && payload.password.length < 8) {
    return res.status(400).json({ message: 'CRM Employee password must be at least 8 characters' })
  }
  if (APP_LOGIN_ROLES.includes(payload.role) && !payload.password) {
    return res.status(400).json({ message: 'Temporary password is required for this login role' })
  }
  if (APP_LOGIN_ROLES.includes(payload.role) && payload.password.length < 6) {
    return res.status(400).json({ message: 'Login role password must be at least 6 characters' })
  }

  payload.employeeId = payload.employeeId || (await getNextEmployeeId())
  payload.createdBy = req.emsUser?.id || null
  await releaseDeletedEmployeeUniqueFields({
    employeeId: payload.employeeId,
    email: payload.email,
    updatedBy: req.emsUser?.id
  })
  await ensureLoginIdentityAvailable(
    { email: payload.email, employeeId: payload.employeeId },
    { exclude: await reusableLoginIdentityExclusions(payload) }
  )

  const employee = await Employee.create(payload)
  await syncCrmEmployeeLogin(employee, payload.password)
  await syncAppUserLogin(employee, payload.password)
  const populated = await Employee.findById(employee._id).populate(employeePopulate)
  res.status(201).json({ message: 'Employee created', employee: populated })
}

const getEmployee = async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false }).populate(employeePopulate)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id) && req.emsUser?.role !== 'manager') {
    return res.status(403).json({ message: 'You cannot access this employee profile' })
  }

  const [documents, attendance, leaves, payroll] = await Promise.all([
    Document.find({ employee: employee._id }).sort({ createdAt: -1 }).limit(10).lean(),
    Attendance.find({ employee: employee._id }).sort({ date: -1 }).limit(10).lean(),
    Leave.find({ employee: employee._id }).sort({ createdAt: -1 }).limit(10).lean(),
    Payroll.find({ employee: employee._id }).sort({ year: -1, month: -1 }).limit(6).lean()
  ])

  res.json({
    employee,
    activity: {
      documents,
      attendance,
      leaves,
      payroll
    }
  })
}

const updateEmployee = async (req, res) => {
  const { payload, errors } = normalizeEmployeePayload(req.body, { partial: true })
  if (errors.length) {
    return res.status(400).json({ message: errors.join(', ') })
  }

  payload.updatedBy = req.emsUser?.id || null
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false }).select('+password')
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const wasCrmEmployee = employee.role === 'crm_employee'
  const wasAppLoginRole = APP_LOGIN_ROLES.includes(employee.role)
  const rawPassword = payload.password
  const nextRole = payload.role || employee.role
  const nextEmail = payload.email || employee.email
  const nextEmployeeId = payload.employeeId || employee.employeeId

  if (nextRole === 'crm_employee' && rawPassword && rawPassword.length < 8) {
    return res.status(400).json({ message: 'CRM Employee password must be at least 8 characters' })
  }
  if (nextRole === 'crm_employee' && !rawPassword && !wasCrmEmployee && !employee.crmUserId) {
    return res.status(400).json({ message: 'Temporary password is required when changing an employee to CRM Employee' })
  }
  if (APP_LOGIN_ROLES.includes(nextRole) && rawPassword && rawPassword.length < 6) {
    return res.status(400).json({ message: 'Login role password must be at least 6 characters' })
  }
  if (APP_LOGIN_ROLES.includes(nextRole) && !rawPassword && !wasAppLoginRole && !employee.appUserId) {
    const appRole = appRoleForEmployeeRole(nextRole)
    const existingAppUser = await User.exists({ email: payload.email || employee.email, role: appRole })
    if (!existingAppUser) {
      return res.status(400).json({ message: 'Temporary password is required when changing to this login role' })
    }
  }

  if (
    (payload.email && payload.email !== employee.email) ||
    (payload.employeeId && payload.employeeId !== employee.employeeId)
  ) {
    await ensureLoginIdentityAvailable(
      { email: nextEmail, employeeId: nextEmployeeId },
      {
        exclude: {
          employee: employee._id,
          user: employee.appUserId,
          crmUser: employee.crmUserId
        }
      }
    )
  }

  Object.entries(payload).forEach(([key, value]) => {
    employee[key] = value
  })
  await employee.save()

  if (employee.role === 'crm_employee') {
    await syncCrmEmployeeLogin(employee, rawPassword)
  } else if (wasCrmEmployee) {
    await deactivateCrmEmployeeLogin(employee)
  }
  if (APP_LOGIN_ROLES.includes(employee.role)) {
    await syncAppUserLogin(employee, rawPassword)
  } else if (wasAppLoginRole) {
    await deactivateAppUserLogin(employee)
  }

  const populated = await Employee.findById(employee._id).populate(employeePopulate)
  res.json({ message: 'Employee updated', employee: populated })
}

const deleteEmployee = async (req, res) => {
  const existingEmployee = await Employee.findOne({ _id: req.params.id, isDeleted: false })
  if (!existingEmployee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const employee = await Employee.findOneAndUpdate(
    { _id: existingEmployee._id, isDeleted: false },
    {
      $set: {
        employeeId: deletedEmployeeId(existingEmployee._id),
        email: deletedEmployeeEmail(existingEmployee._id),
        archivedEmployeeId: existingEmployee.employeeId,
        archivedEmail: existingEmployee.email,
        isDeleted: true,
        deletedAt: new Date(),
        status: 'terminated',
        updatedBy: req.emsUser?.id || null
      },
      $inc: { tokenVersion: 1 }
    },
    { returnDocument: 'after' }
  )

  await deactivateCrmEmployeeLogin(employee)
  await deactivateAppUserLogin(employee)
  await WorkSchedule.updateMany(
    { employee: employee._id, isActive: true },
    { $set: { isActive: false, updatedBy: req.emsUser?.id || null } }
  )
  res.json({ message: 'Employee deleted' })
}

const parseCsvLine = (line) => {
  const values = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

const rowsFromCsv = (csv) => {
  const lines = String(csv || '').split(/\r?\n/).filter((line) => line.trim())
  const headers = parseCsvLine(lines.shift() || '').map((header) => header.trim())
  return lines.map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce((row, header, index) => {
      row[header] = values[index]
      return row
    }, {})
  })
}

const bulkImportEmployees = async (req, res) => {
  const rows = Array.isArray(req.body?.rows)
    ? req.body.rows
    : rowsFromCsv(req.file?.buffer?.toString('utf8') || req.body?.csv || '')

  if (!rows.length) {
    return res.status(400).json({ message: 'CSV rows are required' })
  }

  const created = []
  const errors = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const departmentName = safeText(row.department || row.departmentName)
    const department = departmentName
      ? await Department.findOne({ $or: [{ name: departmentName }, { code: departmentName.toUpperCase() }] }).lean()
      : null
    const payloadSource = {
      ...row,
      department: department?._id || row.departmentId || null,
      salary: {
        basic: row.basic,
        hra: row.hra,
        da: row.da,
        allowances: row.allowances,
        pf: row.pf,
        tds: row.tds
      }
    }

    const { payload, errors: rowErrors } = normalizeEmployeePayload(payloadSource)
    if (rowErrors.length) {
      errors.push({ row: index + 2, errors: rowErrors, data: row })
      continue
    }

    try {
      payload.employeeId = payload.employeeId || (await getNextEmployeeId())
      payload.createdBy = req.emsUser?.id || null
      await ensureLoginIdentityAvailable(
        { email: payload.email, employeeId: payload.employeeId },
        { exclude: await reusableLoginIdentityExclusions(payload) }
      )
      const employee = await Employee.create(payload)
      created.push(employee)
    } catch (error) {
      errors.push({ row: index + 2, errors: [error.message], data: row })
    }
  }

  res.status(errors.length ? 207 : 201).json({
    message: `${created.length} employee(s) imported`,
    created: created.length,
    errors
  })
}

const exportEmployees = async (req, res) => {
  const employees = await Employee.find(employeeFilter(req.query)).populate(employeePopulate).sort({ employeeId: 1 }).lean()
  const columns = [
    { header: 'Employee ID', value: (item) => item.employeeId },
    { header: 'First Name', value: (item) => item.firstName },
    { header: 'Last Name', value: (item) => item.lastName },
    { header: 'Email', value: (item) => item.email },
    { header: 'Phone', value: (item) => item.phone },
    { header: 'Department', value: (item) => item.department?.name },
    { header: 'Designation', value: (item) => item.designation },
    { header: 'Status', value: (item) => item.status },
    { header: 'Employment Type', value: (item) => item.employmentType },
    { header: 'Joining Date', value: (item) => (item.joiningDate ? item.joiningDate.toISOString().slice(0, 10) : '') }
  ]

  if (req.query.format === 'xlsx' || req.query.format === 'excel') {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('EMS Employees')
    worksheet.columns = columns.map((column) => ({ header: column.header, key: column.header, width: 22 }))
    employees.forEach((employee) => {
      worksheet.addRow(columns.reduce((row, column) => ({ ...row, [column.header]: column.value(employee) }), {}))
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="ems-employees.xlsx"')
    await workbook.xlsx.write(res)
    return res.end()
  }

  return sendCsv(res, 'ems-employees.csv', toCsv(employees, columns))
}

module.exports = {
  bulkImportEmployees,
  createEmployee,
  deleteEmployee,
  exportEmployees,
  getEmployee,
  listEmployees,
  updateEmployee
}
