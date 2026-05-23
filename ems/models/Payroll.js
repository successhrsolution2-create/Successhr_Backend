const mongoose = require('mongoose')

const { PAYROLL_STATUSES } = require('../config/emsConstants')

const payrollSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true,
      min: 2000
    },
    salary: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      da: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      pf: { type: Number, default: 0 },
      tds: { type: Number, default: 0 }
    },
    grossPay: {
      type: Number,
      default: 0
    },
    totalDeductions: {
      type: Number,
      default: 0
    },
    netPay: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: PAYROLL_STATUSES,
      default: 'Draft'
    },
    releasedAt: Date,
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  {
    collection: 'ems_payroll',
    timestamps: true
  }
)

payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true })
payrollSchema.index({ year: 1, month: 1, status: 1 })

module.exports = mongoose.models.EmsPayroll || mongoose.model('EmsPayroll', payrollSchema)
