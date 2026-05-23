const { EMS_ROLE_GROUPS } = require('../config/emsConstants')

const expandRoles = (roles) =>
  roles.flatMap((role) => {
    if (EMS_ROLE_GROUPS[role]) return EMS_ROLE_GROUPS[role]
    return role
  })

const requireEmsRole = (...roles) => (req, res, next) => {
  const allowed = new Set(expandRoles(roles))
  const role = req.emsUser?.role

  if (!role) {
    return res.status(401).json({ message: 'EMS authentication is required' })
  }

  if (role === 'ems_super_admin' || allowed.has(role)) {
    return next()
  }

  return res.status(403).json({ message: 'You do not have access to this EMS resource' })
}

const canAccessEmployee = (req, employeeId) => {
  if (!req.emsUser) return false
  if (['ems_super_admin', 'admin', 'hr'].includes(req.emsUser.role)) return true
  return String(req.emsUser.id) === String(employeeId)
}

module.exports = {
  canAccessEmployee,
  requireEmsRole
}
