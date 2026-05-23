const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { auditLog } = require('./backup.audit')
const { validateExportInput } = require('./backup.validator')

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || ''
  return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
}

const verifyBackupToken = (req, res, next) => {
  const token = getBearerToken(req)
  const secret = process.env.BACKUP_JWT_SECRET

  if (!secret || String(secret).length < 32) {
    return res.status(500).json({ success: false, message: 'Backup module is not configured' })
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Backup authorization token required' })
  }

  try {
    req.backupUser = jwt.verify(token, secret, { algorithms: ['HS256'] })
    return next()
  } catch (_error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired backup authorization token' })
  }
}

const requireSuperAdmin = async (req, res, next) => {
  if (req.backupUser?.role === 'super_admin') return next()

  await auditLog({
    adminId: req.backupUser?._id,
    adminEmail: req.backupUser?.email || 'unknown',
    adminRole: req.backupUser?.role || 'unknown',
    action: 'UNAUTHORIZED_ATTEMPT',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    status: 'unauthorized',
    errorMsg: 'Backup access restricted to Super Admin'
  })

  return res.status(403).json({ success: false, message: 'Backup access restricted to Super Admin' })
}

const backupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.backupUser?._id || 'backup-unknown-admin'),
  handler: async (req, res) => {
    await auditLog({
      adminId: req.backupUser?._id,
      adminEmail: req.backupUser?.email || 'unknown',
      adminRole: req.backupUser?.role || 'unknown',
      action: 'RATE_LIMIT_HIT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed',
      errorMsg: 'Export limit reached. Try after 1 hour.'
    })

    return res.status(429).json({ success: false, message: 'Export limit reached. Try after 1 hour.' })
  }
})

module.exports = {
  verifyBackupToken,
  requireSuperAdmin,
  backupRateLimiter,
  validateExportInput
}
