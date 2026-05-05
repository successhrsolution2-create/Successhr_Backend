const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

const sanitizeUser = (user) => {
  const safe = user.toJSON ? user.toJSON() : user
  delete safe.password
  return safe
}

const normalizeEmail = (email) => email.toLowerCase().trim()

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password')

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const matches = await bcrypt.compare(password, user.password)

  if (!matches) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  res.json({
    token: signToken(user._id),
    user: sanitizeUser(user)
  })
}

const me = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
}

const getSuperAdminSettings = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
}

const updateSuperAdminProfile = async (req, res) => {
  const { name, email } = req.body
  const user = req.user

  if (name === undefined && email === undefined) {
    return res.status(400).json({ message: 'Nothing to update' })
  }

  if (name !== undefined) {
    const normalizedName = String(name || '').trim()
    if (!normalizedName) {
      return res.status(400).json({ message: 'Name is required' })
    }
    user.name = normalizedName
  }

  if (email !== undefined) {
    const normalized = normalizeEmail(String(email || ''))
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
  const { currentPassword, newPassword, confirmPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' })
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
  await user.save()

  res.json({ message: 'Password updated successfully' })
}

module.exports = {
  login,
  me,
  getSuperAdminSettings,
  updateSuperAdminProfile,
  updateSuperAdminPassword
}
