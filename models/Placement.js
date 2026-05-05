const mongoose = require('mongoose')

const selectionStatuses = ['shortlisted', 'selected', 'joined', 'rejected', 'on_hold']
const earningStatuses = ['pending', 'paid']
const processStages = [
  'appointment_letter_pending',
  'appointment_letter_shared',
  'interview_scheduled',
  'interview_completed',
  'selected',
  'joined',
  'rejected',
  'on_hold'
]
const interviewModes = ['Online', 'Offline', 'Telephonic', 'Hybrid']

const placementSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    baId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    jobProfile: String,
    offeredSalaryPM: {
      type: Number,
      default: 0
    },
    joiningDate: Date,
    selectionStatus: {
      type: String,
      enum: selectionStatuses,
      default: 'shortlisted'
    },
    processStage: {
      type: String,
      enum: processStages,
      default: 'appointment_letter_pending'
    },
    appointmentLetterDate: Date,
    interviewDate: Date,
    interviewMode: {
      type: String,
      enum: interviewModes
    },
    processNotes: String,
    adminNotes: String,
    earningPercent: {
      type: Number,
      default: 0
    },
    salaryBasis: {
      type: Number,
      default: 1,
      min: 1,
      max: 12
    },
    earningAmount: {
      type: Number,
      default: 0
    },
    earningStatus: {
      type: String,
      enum: earningStatuses,
      default: 'pending'
    },
    earningPaidDate: Date
  },
  { timestamps: true }
)

placementSchema.pre('save', function updateEarning() {
  const salary = Number(this.offeredSalaryPM || 0)
  const basis = Number(this.salaryBasis || 1)
  const percent = Number(this.earningPercent || 0)

  const safeSalary = Number.isFinite(salary) ? salary : 0
  const safeBasis = Number.isFinite(basis) ? basis : 1
  const safePercent = Number.isFinite(percent) ? percent : 0

  this.earningAmount = Math.round(safeSalary * safeBasis * (safePercent / 100))
})

placementSchema.statics.selectionStatuses = selectionStatuses
placementSchema.statics.earningStatuses = earningStatuses
placementSchema.statics.processStages = processStages
placementSchema.statics.interviewModes = interviewModes

module.exports = mongoose.model('Placement', placementSchema)
