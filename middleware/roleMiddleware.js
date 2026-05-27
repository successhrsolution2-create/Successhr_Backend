const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource' })
    }

    next()
  }
}

const hasManagerAccess = (user, moduleName) => {
  if (!user || !moduleName) return false
  if (user.role === 'superAdmin') return true
  return user.role === 'manager' && Array.isArray(user.managerAccess) && user.managerAccess.includes(moduleName)
}

const requireRoleOrManagerAccess = (moduleName, ...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'You do not have access to this resource' })
    }

    if (roles.includes(req.user.role) || hasManagerAccess(req.user, moduleName)) {
      return next()
    }

    return res.status(403).json({ message: 'You do not have access to this resource' })
  }
}

module.exports = { hasManagerAccess, requireRole, requireRoleOrManagerAccess }
