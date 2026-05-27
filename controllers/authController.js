const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const {
  AUTH_COOKIE_NAME,
  SESSION_MARKER,
  authCookieOptions,
  clearAuthCookieOptions,
  tokenFromRequest
} = require('../utils/authCookie')

const PASSWORD_MAX_LENGTH = 72
const DUMMY_PASSWORD_HASH = '$2b$10$851oawsmsIi4AYoa79T2s.GGVhGw453ExsWo29K/gbtBQ.FD8VGk.'

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      tokenVersion: user.tokenVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_ACCOUNT_LOCK_MS = 15 * 60 * 1000
const LOGIN_ACCOUNT_LOCK_THRESHOLD = 10
const LOGIN_ACCOUNT_LOCK_MESSAGE = 'Too many failed login attempts for this account. Please try again later.'
const loginAttempts = new Map()

const signDirectorAssessmentToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      purpose: 'director-assessment-approval',
      tokenVersion: user.tokenVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )

const sanitizeUser = (user) => {
  const safe = user.toJSON ? user.toJSON() : user
  delete safe.password
  return safe
}

const normalizeEmail = (email) => email.toLowerCase().trim()
const isText = (value) => typeof value === 'string'
const trimmedText = (value) => (isText(value) ? value.trim() : '')
const requestBody = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {})

const isPasswordTooLong = (password) => isText(password) && password.length > PASSWORD_MAX_LENGTH

const getLoginAttemptState = (email) => {
  const now = Date.now()
  const current = loginAttempts.get(email)

  if (!current || current.firstAttemptAt + LOGIN_ATTEMPT_WINDOW_MS < now) {
    const fresh = { count: 0, firstAttemptAt: now, lockedUntil: 0 }
    loginAttempts.set(email, fresh)
    return fresh
  }

  return current
}

const accountLockMessage = (email) => {
  const state = getLoginAttemptState(email)
  if (state.lockedUntil > Date.now()) {
    return LOGIN_ACCOUNT_LOCK_MESSAGE
  }
  return null
}

const recordFailedLogin = (email) => {
  const state = getLoginAttemptState(email)
  state.count += 1

  if (state.count >= LOGIN_ACCOUNT_LOCK_THRESHOLD) {
    state.lockedUntil = Date.now() + LOGIN_ACCOUNT_LOCK_MS
    console.warn(`[auth-lockout] Temporary login lock for account: ${email}`)
    return true
  }

  return false
}

const clearFailedLogins = (email) => {
  loginAttempts.delete(email)
}

const login = async (req, res) => {
  const { email, password } = requestBody(req.body)

  if (!isText(email) || !isText(password) || !trimmedText(email) || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  if (isPasswordTooLong(password)) {
    return res.status(400).json({ message: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters` })
  }

  const loginId = trimmedText(email)
  const isEmailLogin = loginId.includes('@')
  const loginKey = isEmailLogin ? normalizeEmail(loginId) : loginId.toUpperCase()
  const lockMessage = accountLockMessage(loginKey)
  if (lockMessage) {
    return res.status(429).json({ message: lockMessage })
  }

  const user = await User.findOne(isEmailLogin ? { email: normalizeEmail(loginId) } : { employeeId: loginKey }).select('+password')

  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
    const locked = recordFailedLogin(loginKey)
    if (locked) {
      return res.status(429).json({ message: LOGIN_ACCOUNT_LOCK_MESSAGE })
    }
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const matches = await bcrypt.compare(password, user.password)

  if (!matches) {
    const locked = recordFailedLogin(loginKey)
    if (locked) {
      return res.status(429).json({ message: LOGIN_ACCOUNT_LOCK_MESSAGE })
    }
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  clearFailedLogins(loginKey)
  res.cookie(AUTH_COOKIE_NAME, signToken(user), authCookieOptions())
  res.json({
    token: SESSION_MARKER,
    user: sanitizeUser(user)
  })
}

const logout = async (req, res) => {
  const token = tokenFromRequest(req)

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      if (decoded?.id) {
        await User.updateOne({ _id: decoded.id }, { $inc: { tokenVersion: 1 } })
      }
    } catch (_error) {
      // Clearing the cookie is still the correct response for malformed or expired logout tokens.
    }
  }

  res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions())
  res.json({ message: 'Logged out' })
}

const createDirectorAssessmentUnlock = async (req, res) => {
  const { password } = requestBody(req.body)

  if (!isText(password) || !password) {
    return res.status(400).json({ message: 'Super admin password is required' })
  }

  if (isPasswordTooLong(password)) {
    return res.status(400).json({ message: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters` })
  }

  const superAdmins = await User.find({ role: 'superAdmin', isActive: true }).select('+password')

  for (const user of superAdmins) {
    const matches = await bcrypt.compare(password, user.password)
    if (matches) {
      return res.json({
        token: signDirectorAssessmentToken(user),
        expiresIn: 15 * 60,
        approvedBy: sanitizeUser(user)
      })
    }
  }

  return res.status(403).json({ message: 'Invalid super admin password' })
}

const me = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
}

const getSuperAdminSettings = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
}

const updateSuperAdminProfile = async (req, res) => {
  const { name, email } = requestBody(req.body)
  const user = req.user

  if (name === undefined && email === undefined) {
    return res.status(400).json({ message: 'Nothing to update' })
  }

  if (name !== undefined) {
    if (!isText(name)) {
      return res.status(400).json({ message: 'Name must be text' })
    }
    const normalizedName = trimmedText(name)
    if (!normalizedName) {
      return res.status(400).json({ message: 'Name is required' })
    }
    user.name = normalizedName
  }

  if (email !== undefined) {
    if (!isText(email)) {
      return res.status(400).json({ message: 'Email must be text' })
    }
    const normalized = normalizeEmail(email)
    if (!normalized) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const existing = await User.findOne({ email: normalized, _id: { $ne: user._id } })
    if (existing) {
      return res.status(409).json({ message: 'A user with this email already exists' })
    }

    user.email = normalized
  }

  await user.save()
  res.json({ message: 'Profile updated', user: sanitizeUser(user) })
}

const updateSuperAdminPassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = requestBody(req.body)

  if (!isText(currentPassword) || !isText(newPassword) || !currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' })
  }

  if (isPasswordTooLong(currentPassword) || isPasswordTooLong(newPassword)) {
    return res.status(400).json({ message: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters` })
  }

  if (confirmPassword !== undefined && !isText(confirmPassword)) {
    return res.status(400).json({ message: 'Confirm password must be text' })
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' })
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New password and confirm password do not match' })
  }

  const user = await User.findById(req.user._id).select('+password')

  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  const validCurrentPassword = await bcrypt.compare(currentPassword, user.password)
  if (!validCurrentPassword) {
    return res.status(400).json({ message: 'Current password is incorrect' })
  }

  const sameAsCurrent = await bcrypt.compare(newPassword, user.password)
  if (sameAsCurrent) {
    return res.status(400).json({ message: 'New password must be different from current password' })
  }

  user.password = await bcrypt.hash(newPassword, 10)
  user.tokenVersion = Number(user.tokenVersion || 0) + 1
  await user.save()

  res.json({ message: 'Password updated successfully' })
}

module.exports = {
  login,
  logout,
  me,
  createDirectorAssessmentUnlock,
  getSuperAdminSettings,
  updateSuperAdminProfile,
  updateSuperAdminPassword
}
