const mongoose = require('mongoose')

const { LEAVE_STATUSES, LEAVE_TYPES } = require('../config/emsConstants')

const approvalSchema = new mongoose.Schema(
  {
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    actedAt: Date,
    note: {
      type: String,
      trim: true,
      maxlength: 1000
    }
  },
  { _id: false }
)

const leaveSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: 'pending_manager'
    },
    managerApproval: {
      type: approvalSchema,
      default: () => ({})
    },
    hrApproval: {
      type: approvalSchema,
      default: () => ({})
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  {
    collection: 'ems_leaves',
    timestamps: true
  }
)

leaveSchema.index({ employee: 1, startDate: -1 })
leaveSchema.index({ status: 1, startDate: 1 })
leaveSchema.index({ leaveType: 1 })

module.exports = mongoose.models.EmsLeave || mongoose.model('EmsLeave', leaveSchema)
