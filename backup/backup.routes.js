const router = require('express').Router()
const { verifyToken } = require('../middleware/authMiddleware')
const {
  backupRateLimiter,
  requireSuperAdmin,
  validateExportInput,
  verifyBackupToken
} = require('./backup.middleware')
const {
  createBackupSession,
  downloadExport,
  getAuditHistory,
  requestExport
} = require('./backup.controller')

router.post('/session', verifyToken, createBackupSession)

router.use(verifyBackupToken)
router.use(requireSuperAdmin)

router.post('/request', backupRateLimiter, validateExportInput, requestExport)
router.get('/download', downloadExport)
router.get('/audit', getAuditHistory)

module.exports = router
