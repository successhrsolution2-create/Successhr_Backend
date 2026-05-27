const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const Employee = require('../models/Employee')
const CrmUser = require('../../crm/models/CrmUser.model')
const User = require('../../models/User')
const { ATTENDANCE_LOGIN_ROLES } = require('../config/emsConstants')
const { getEmsJwtSecret } = require('../middleware/emsAuth')

const ATTENDANCE_ACCESS_MESSAGE = 'This EMS role is not enabled for attendance management'
const APP_ATTENDANCE_ROLES = ['superAdmin', 'candidateAdmin', 'manager']

const canUseAttendanceManagement = (employee) =>
  ATTENDANCE_LOGIN_ROLES.includes(employee?.role)

const getEmsRefreshSecret = () => {
  return process.env.EMS_REFRESH_SECRET || getEmsJwtSecret()
}

const signEmsToken = (employee) =>
  jwt.sign(
    {
      sub: employee._id,
      employeeId: employee.employeeId,
      role: employee.role,
      tokenVersion: employee.tokenVersion || 0
    },
    getEmsJwtSecret(),
    { expiresIn: process.env.EMS_JWT_EXPIRES_IN || '8h' }
  )

const signEmsRefreshToken = (employee) =>
  jwt.sign(
    {
      sub: employee._id,
      purpose: 'ems_refresh',
      tokenVersion: employee.tokenVersion || 0
    },
    getEmsRefreshSecret(),
    { expiresIn: process.env.EMS_REFRESH_EXPIRES_IN || '30d' }
  )

const sanitizeEmployee = (employee) => {
  const safe = employee.toJSON ? employee.toJSON() : { ...employee }
  delete safe.password
  delete safe.tokenVersion
  return safe
}

const employeeLoginQuery = (loginId) => ({
  isDeleted: false,
  $or: [
    { email: loginId.toLowerCase() },
    { employeeId: loginId.toUpperCase() }
  ]
})

const appLoginQuery = (loginId) =>
  loginId.includes('@') ? { email: loginId.toLowerCase() } : { employeeId: loginId.toUpperCase() }

const linkedEmployeeQuery = ({ email, employeeId, appUserId, crmUserId }) => {
  const matches = []
  if (appUserId) matches.push({ appUserId })
  if (crmUserId) matches.push({ crmUserId })
  if (email) matches.push({ email: String(email).toLowerCase() })
  if (employeeId) matches.push({ employeeId: String(employeeId).toUpperCase() })

  return {
    isDeleted: false,
    status: 'active',
    role: { $in: ATTENDANCE_LOGIN_ROLES },
    $or: matches
  }
}

const findLinkedEmployee = async (link) => {
  const query = linkedEmployeeQuery(link)
  if (!query.$or.length) return null
  return Employee.findOne(query).select('+tokenVersion')
}

const authResponse = (res, employee) => {
  const accessToken = signEmsToken(employee)
  const refreshTokenValue = signEmsRefreshToken(employee)

  return res.json({
    accessToken,
    refreshToken: refreshTokenValue,
    token: accessToken,
    user: sanitizeEmployee(employee)
  })
}

const loginWithEmployeeAccount = async (loginId, password) => {
  const employee = await Employee.findOne(employeeLoginQuery(loginId)).select('+password +tokenVersion')
  if (!employee || employee.status !== 'active') return { matched: false }

  const matches = await employee.comparePassword(password)
  if (!matches) return { matched: false }

  if (!canUseAttendanceManagement(employee)) return { matched: true, forbidden: true }
  return { matched: true, employee }
}

const loginWithAppAdminAccount = async (loginId, password) => {
  const user = await User.findOne(appLoginQuery(loginId)).select('+password')
  if (!user || !user.isActive || !APP_ATTENDANCE_ROLES.includes(user.role)) return { matched: false }

  const matches = await bcrypt.compare(password, user.password)
  if (!matches) return { matched: false }

  const employee = await findLinkedEmployee({
    appUserId: user._id,
    email: user.email,
    employeeId: user.employeeId
  })

  return employee ? { matched: true, employee } : { matched: true, forbidden: true }
}

const loginWithCrmAccount = async (loginId, password) => {
  const crmUser = await CrmUser.findOne(appLoginQuery(loginId)).select('+password')
  if (!crmUser || !crmUser.isActive || crmUser.role !== 'crm_employee') return { matched: false }

  const matches = await crmUser.comparePassword(password)
  if (!matches) return { matched: false }

  const employee = await findLinkedEmployee({
    crmUserId: crmUser._id,
    email: crmUser.email,
    employeeId: crmUser.employeeId
  })

  return employee ? { matched: true, employee } : { matched: true, forbidden: true }
}

const login = async (req, res) => {
  const loginId = String(req.body?.email || req.body?.employeeId || '').trim()
  const password = String(req.body?.password || '')

  if (!loginId || !password) {
    return res.status(400).json({ message: 'Employee ID/email and password are required' })
  }

  const attempts = [
    await loginWithEmployeeAccount(loginId, password),
    await loginWithAppAdminAccount(loginId, password),
    await loginWithCrmAccount(loginId, password)
  ]

  const validLogin = attempts.find((attempt) => attempt.matched && !attempt.forbidden) ||
    attempts.find((attempt) => attempt.matched)
  if (!validLogin) {
    return res.status(401).json({ message: 'Invalid EMS email or password' })
  }
  if (validLogin.forbidden) {
    return res.status(403).json({ message: ATTENDANCE_ACCESS_MESSAGE })
  }

  return authResponse(res, validLogin.employee)
}

const me = async (req, res) => {
  if (req.emsUser?.source === 'app_super_admin') {
    return res.json({
      user: {
        id: req.emsUser.id,
        name: req.emsUser.name,
        email: req.emsUser.email,
        role: 'ems_super_admin',
        source: req.emsUser.source
      }
    })
  }

  const employee = await Employee.findOne({ _id: req.emsUser.id, isDeleted: false })
    .populate('department', 'name code')
    .populate('manager', 'employeeId firstName lastName email')

  if (!employee) {
    return res.status(404).json({ message: 'EMS user not found' })
  }

  if (!canUseAttendanceManagement(employee)) {
    return res.status(403).json({ message: ATTENDANCE_ACCESS_MESSAGE })
  }

  return res.json({ user: sanitizeEmployee(employee) })
}

const refreshToken = async (req, res) => {
  const refreshTokenValue = String(req.body?.refreshToken || req.headers['x-ems-refresh-token'] || '').trim()

  if (!refreshTokenValue) {
    return res.status(400).json({ message: 'EMS refresh token is required' })
  }

  try {
    const decoded = jwt.verify(refreshTokenValue, getEmsRefreshSecret(), { algorithms: ['HS256'] })
    if (decoded?.purpose !== 'ems_refresh') {
      return res.status(401).json({ message: 'Invalid EMS refresh token' })
    }

    const employee = await Employee.findById(decoded.sub).select('+tokenVersion')
    if (!employee || employee.status !== 'active' || employee.isDeleted) {
      return res.status(401).json({ message: 'EMS user is inactive' })
    }

    if (!canUseAttendanceManagement(employee)) {
      return res.status(403).json({ message: ATTENDANCE_ACCESS_MESSAGE })
    }

    if (Number(decoded.tokenVersion ?? -1) !== Number(employee.tokenVersion || 0)) {
      return res.status(401).json({ message: 'EMS refresh token has been revoked' })
    }

    return authResponse(res, employee)
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired EMS refresh token' })
  }
}

module.exports = {
  login,
  me,
  refreshToken
}
