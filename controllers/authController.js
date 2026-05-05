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

module.exports = { login, me }
