const ExcelJS = require('exceljs')

const Department = require('../models/Department')
const Document = require('../models/Document')
const Employee = require('../models/Employee')
const Attendance = require('../models/Attendance')
const Leave = require('../models/Leave')
const Payroll = require('../models/Payroll')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { normalizeEmployeePayload } = require('../validations/employeeValidation')
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

const employeeFilter = (query = {}) => {
  const filter = {
    isDeleted: false,
    ...buildSearch(query.search, ['employeeId', 'firstName', 'lastName', 'email', 'phone', 'designation'])
  }
  if (query.department) filter.department = query.department
  if (query.status) filter.status = query.status
  if (query.type) filter.employmentType = query.type
  if (query.role) filter.role = query.role
  return filter
}

const listEmployees = async (req, res) => {
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

  payload.employeeId = payload.employeeId || (await getNextEmployeeId())
  payload.createdBy = req.emsUser?.id || null

  const employee = await Employee.create(payload)
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

  Object.entries(payload).forEach(([key, value]) => {
    employee[key] = value
  })
  await employee.save()

  const populated = await Employee.findById(employee._id).populate(employeePopulate)
  res.json({ message: 'Employee updated', employee: populated })
}

const deleteEmployee = async (req, res) => {
  const employee = await Employee.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    {
      isDeleted: true,
      deletedAt: new Date(),
      status: 'terminated',
      updatedBy: req.emsUser?.id || null,
      $inc: { tokenVersion: 1 }
    },
    { new: true }
  )

  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

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
