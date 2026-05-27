const jwt = require('jsonwebtoken')

const Employee = require('../models/Employee')
const User = require('../../models/User')
const { hasManagerAccess } = require('../../middleware/roleMiddleware')

const APP_AUTH_COOKIE_NAME = 'success_hr_session'
const SESSION_MARKER = 'cookie'

const parseCookies = (cookieHeader = '') =>
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return cookies
      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1)
      if (!key) return cookies
      try {
        cookies[key] = decodeURIComponent(value)
      } catch (_error) {
        cookies[key] = value
      }
      return cookies
    }, {})

const bearerToken = (req) => {
  const authHeader = String(req.headers.authorization || '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  return token && token !== SESSION_MARKER ? token : null
}

const appSessionToken = (req) => parseCookies(req.headers.cookie)[APP_AUTH_COOKIE_NAME] || null

const getEmsJwtSecret = () => {
  const secret = process.env.EMS_JWT_SECRET || process.env.JWT_SECRET
  if (!secret) {
    const error = new Error('EMS_JWT_SECRET or JWT_SECRET is not configured')
    error.status = 500
    throw error
  }
  return secret
}

const sanitizeEmployeePrincipal = (employee) => ({
  id: String(employee._id),
  employeeId: employee.employeeId,
  name: employee.fullName,
  email: employee.email,
  role: employee.role,
  source: 'ems_employee'
})

const authenticateEmsToken = async (token) => {
  const decoded = jwt.verify(token, getEmsJwtSecret(), { algorithms: ['HS256'] })
  const employeeId = decoded.sub || decoded.id
  const employee = await Employee.findOne({ _id: employeeId, isDeleted: false }).select('+tokenVersion')

  if (!employee || employee.status !== 'active') {
    const error = new Error('EMS employee is inactive or no longer exists')
    error.status = 401
    throw error
  }

  if (Number(decoded.tokenVersion ?? -1) !== Number(employee.tokenVersion || 0)) {
    const error = new Error('EMS token has been revoked')
    error.status = 401
    throw error
  }

  return sanitizeEmployeePrincipal(employee)
}

const authenticateAppUserToken = async (token) => {
  if (!process.env.JWT_SECRET) return null

  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  const user = await User.findById(decoded.id).select('_id name email role managerAccess isActive tokenVersion')

  if (!user || !user.isActive) return null
  if (Number(decoded.tokenVersion ?? -1) !== Number(user.tokenVersion || 0)) return null

  if (user.role !== 'superAdmin' && !hasManagerAccess(user, 'employeeManagement')) return null

  return {
    id: String(user._id),
    appUserId: String(user._id),
    employeeId: null,
    name: user.name,
    email: user.email,
    role: 'ems_super_admin',
    source: user.role === 'superAdmin' ? 'app_super_admin' : 'app_manager'
  }
}

const emsAuth = async (req, res, next) => {
  const token = bearerToken(req)
  const cookieToken = appSessionToken(req)

  try {
    if (token) {
      try {
        req.emsUser = await authenticateEmsToken(token)
        return next()
      } catch (error) {
        const appPrincipal = await authenticateAppUserToken(token).catch(() => null)
        if (appPrincipal) {
          req.emsUser = appPrincipal
          return next()
        }
        throw error
      }
    }

    if (cookieToken) {
      const appPrincipal = await authenticateAppUserToken(cookieToken)
      if (appPrincipal) {
        req.emsUser = appPrincipal
        return next()
      }
    }

    return res.status(401).json({ message: 'EMS authorization token is required' })
  } catch (error) {
    return res.status(error.status || 401).json({ message: error.status === 500 ? error.message : 'Invalid or expired EMS token' })
  }
}

const optionalEmsAuth = async (req, _res, next) => {
  try {
    const token = bearerToken(req)
    const cookieToken = appSessionToken(req)
    if (token) {
      req.emsUser = await authenticateEmsToken(token).catch(() => authenticateAppUserToken(token))
    } else if (cookieToken) {
      req.emsUser = await authenticateAppUserToken(cookieToken)
    }
  } catch (_error) {
    req.emsUser = null
  }
  return next()
}

module.exports = {
  emsAuth,
  getEmsJwtSecret,
  optionalEmsAuth
}
