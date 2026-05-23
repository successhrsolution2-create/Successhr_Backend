const mongoose = require('mongoose')

const { DEFAULT_LEAVE_ALLOCATIONS, LEAVE_TYPES } = require('../config/emsConstants')

const balanceSchema = new mongoose.Schema(
  {
    allocated: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
)

const leaveBalanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    balances: {
      type: Map,
      of: balanceSchema,
      default: () =>
        LEAVE_TYPES.reduce((result, type) => {
          result[type] = {
            allocated: DEFAULT_LEAVE_ALLOCATIONS[type] || 0,
            used: 0,
            pending: 0
          }
          return result
        }, {})
    }
  },
  {
    collection: 'ems_leave_balances',
    timestamps: true
  }
)

leaveBalanceSchema.index({ employee: 1, year: 1 }, { unique: true })

module.exports = mongoose.models.EmsLeaveBalance || mongoose.model('EmsLeaveBalance', leaveBalanceSchema)
