const mongoose = require('mongoose')

const { Schema } = mongoose

const CALL_LOG_STATUSES = ['answered', 'not_answered', 'busy', 'callback']

const crmCallLogSchema = new Schema(
  {
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCandidate',
      required: [true, 'Candidate is required']
    },
    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmUser',
      required: [true, 'Recruiter is required']
    },
    calledAt: {
      type: Date,
      default: Date.now
    },
    remark: {
      type: String,
      trim: true,
      maxlength: [2000, 'Call remark cannot exceed 2000 characters']
    },
    status: {
      type: String,
      enum: {
        values: CALL_LOG_STATUSES,
        message: 'Invalid call log status'
      },
      required: [true, 'Call status is required']
    },
    nextFollowup: {
      type: Date,
      default: null
    }
  },
  {
    collection: 'crm_call_logs',
    timestamps: false
  }
)

crmCallLogSchema.index({ candidateId: 1, calledAt: -1 })
crmCallLogSchema.index({ recruiterId: 1, calledAt: -1 })
crmCallLogSchema.index({ status: 1 })
crmCallLogSchema.index({ nextFollowup: 1 })

crmCallLogSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.models.CrmCallLog || mongoose.model('CrmCallLog', crmCallLogSchema)
module.exports.CALL_LOG_STATUSES = CALL_LOG_STATUSES
