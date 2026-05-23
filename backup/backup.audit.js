const BackupAuditLog = require('./models/BackupAuditLog.model')

const safeErrorMessage = (message) => String(message || '').slice(0, 500)

const auditLog = async (data = {}) => {
  try {
    await BackupAuditLog.create({
      ...data,
      adminEmail: data.adminEmail || 'unknown',
      adminRole: data.adminRole || 'unknown',
      errorMsg: data.errorMsg ? safeErrorMessage(data.errorMsg) : undefined
    })
  } catch (error) {
    console.error('Backup audit log failed:', error.message)
  }
}

module.exports = { auditLog }
