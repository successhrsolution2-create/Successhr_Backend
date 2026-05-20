const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { tokenFromRequest } = require('../utils/authCookie')

const verifyToken = async (req, res, next) => {
  const token = tokenFromRequest(req)

  if (!token) {
    return res.status(401).json({ message: 'Authentication token missing' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const user = await User.findById(decoded.id)

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User is inactive or no longer exists' })
    }

    if (Number(decoded.tokenVersion ?? -1) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Token has been revoked' })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

module.exports = { verifyToken }
