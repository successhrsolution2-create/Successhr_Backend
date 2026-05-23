const mongoose = require('mongoose')

const backupAuditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    adminEmail: {
      type: String,
      required: true,
      trim: true
    },
    adminRole: {
      type: String,
      required: true,
      trim: true
    },
    action: {
      type: String,
      enum: [
        'EXPORT_REQUESTED',
        'EXPORT_GENERATED',
        'EXPORT_DOWNLOADED',
        'EXPORT_FAILED',
        'UNAUTHORIZED_ATTEMPT',
        'RATE_LIMIT_HIT'
      ],
      required: true
    },
    panels: [{ type: String }],
    fromDate: Date,
    toDate: Date,
    recordCounts: {
      candidateManagement: { type: Number, default: 0 },
      businessAdvisor: { type: Number, default: 0 },
      crm: { type: Number, default: 0 }
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ['success', 'failed', 'unauthorized'],
      required: true
    },
    errorMsg: String,
    durationMs: Number
  },
  {
    timestamps: true,
    collection: 'backup_audit_logs'
  }
)

backupAuditLogSchema.index({ adminId: 1, createdAt: -1 })
backupAuditLogSchema.index({ action: 1 })
backupAuditLogSchema.index({ createdAt: -1 })
backupAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 })

module.exports =
  mongoose.models.BackupAuditLog || mongoose.model('BackupAuditLog', backupAuditLogSchema)
