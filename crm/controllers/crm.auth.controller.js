const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const CrmUser = require('../models/CrmUser.model')
const { getCrmJwtSecret } = require('../middleware/crm.auth.middleware')

const ACCESS_TOKEN_EXPIRY = '8h'
const REFRESH_TOKEN_EXPIRY = '7d'
const REFRESH_COOKIE_NAME = 'crm_refresh_token'
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const DUMMY_CRM_PASSWORD_HASH = '$2b$12$UsjKfm6YsJel1tLDNfkrG.CXwaJvV9Vt/jT8O19ZRrXkfXwI4jO0a'

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: REFRESH_COOKIE_MAX_AGE,
  path: '/crm/auth'
})

const getClearRefreshCookieOptions = () => {
  const options = getRefreshCookieOptions()
  delete options.maxAge
  return options
}

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((cookies, cookie) => {
    const [rawName, ...rawValueParts] = cookie.split('=')
    const name = rawName?.trim()

    if (!name) return cookies

    const rawValue = rawValueParts.join('=')

    try {
      cookies[name] = decodeURIComponent(rawValue)
    } catch (_error) {
      cookies[name] = rawValue
    }

    return cookies
  }, {})

const toAuthUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive
})

const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      type: 'access',
      tokenVersion: user.tokenVersion || 0
    },
    getCrmJwtSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

const signRefreshToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      id: user._id.toString(),
      role: user.role,
      type: 'refresh',
      tokenVersion: user.tokenVersion || 0
    },
    getCrmJwtSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )

const login = async (req, res, next) => {
  try {
    const { password } = req.body
    const loginId = String(req.body?.loginId || req.body?.email || '').trim()
    const user = await CrmUser.findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { employeeId: loginId.toUpperCase() }
      ]
    }).select('+password')

    if (!user) {
      await bcrypt.compare(password, DUMMY_CRM_PASSWORD_HASH)
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      })
    }

    const passwordMatches = await user.comparePassword(password)

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      })
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'CRM account is inactive'
      })
    }

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user)

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions())

    return res.status(200).json({
      success: true,
      message: 'CRM login successful',
      accessToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: toAuthUser(user)
    })
  } catch (error) {
    return next(error)
  }
}

const logout = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie)
  const refreshToken = cookies[REFRESH_COOKIE_NAME]

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, getCrmJwtSecret(), { algorithms: ['HS256'] })
      if (decoded?.sub) {
        await CrmUser.updateOne({ _id: decoded.sub }, { $inc: { tokenVersion: 1 } })
      }
    } catch (_error) {
      // Always clear the refresh cookie even if the token is already invalid.
    }
  }

  res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions())

  return res.status(200).json({
    success: true,
    message: 'CRM logout successful'
  })
}

const refresh = async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie)
    const refreshToken = cookies[REFRESH_COOKIE_NAME]

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'CRM refresh token is required'
      })
    }

    const decoded = jwt.verify(refreshToken, getCrmJwtSecret(), { algorithms: ['HS256'] })

    if (decoded.type !== 'refresh' || !decoded.sub) {
      return res.status(401).json({
        success: false,
        message: 'Invalid CRM refresh token'
      })
    }

    const user = await CrmUser.findById(decoded.sub).select('_id name email role isActive tokenVersion')

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'CRM account is inactive or no longer exists'
      })
    }

    if (Number(decoded.tokenVersion ?? -1) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'CRM refresh token has been revoked'
      })
    }

    const accessToken = signAccessToken(user)

    return res.status(200).json({
      success: true,
      message: 'CRM token refreshed',
      accessToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: toAuthUser(user)
    })
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired CRM refresh token'
      })
    }

    return next(error)
  }
}

module.exports = {
  login,
  logout,
  refresh
}
