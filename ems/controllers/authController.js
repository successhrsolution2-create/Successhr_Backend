const jwt = require('jsonwebtoken')

const Employee = require('../models/Employee')
const { getEmsJwtSecret } = require('../middleware/emsAuth')

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

const login = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const employee = await Employee.findOne({ email, isDeleted: false }).select('+password +tokenVersion')
  if (!employee || employee.status !== 'active') {
    return res.status(401).json({ message: 'Invalid EMS email or password' })
  }

  const matches = await employee.comparePassword(password)
  if (!matches) {
    return res.status(401).json({ message: 'Invalid EMS email or password' })
  }

  const accessToken = signEmsToken(employee)
  const refreshTokenValue = signEmsRefreshToken(employee)

  res.json({
    accessToken,
    refreshToken: refreshTokenValue,
    token: accessToken,
    user: sanitizeEmployee(employee)
  })
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

    if (Number(decoded.tokenVersion ?? -1) !== Number(employee.tokenVersion || 0)) {
      return res.status(401).json({ message: 'EMS refresh token has been revoked' })
    }

    const accessToken = signEmsToken(employee)
    const nextRefreshToken = signEmsRefreshToken(employee)

    return res.json({
      accessToken,
      refreshToken: nextRefreshToken,
      token: accessToken,
      user: sanitizeEmployee(employee)
    })
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired EMS refresh token' })
  }
}

module.exports = {
  login,
  me,
  refreshToken
}
