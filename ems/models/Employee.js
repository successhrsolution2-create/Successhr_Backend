const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')

const { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMS_ROLES } = require('../config/emsConstants')

const salarySchema = new mongoose.Schema(
  {
    basic: { type: Number, default: 0, min: 0 },
    hra: { type: Number, default: 0, min: 0 },
    da: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    pf: { type: Number, default: 0, min: 0 },
    tds: { type: Number, default: 0, min: 0 },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true, uppercase: true }
  },
  { _id: false }
)

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 80
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 80
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: 180,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['', 'Male', 'Female', 'Other', 'Prefer not to say'],
      default: ''
    },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postalCode: { type: String, trim: true }
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsDepartment',
      default: null
    },
    designation: {
      type: String,
      trim: true,
      maxlength: 120
    },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: 'Full-time'
    },
    status: {
      type: String,
      enum: EMPLOYEE_STATUSES,
      default: 'active'
    },
    joiningDate: {
      type: Date,
      default: Date.now
    },
    exitDate: Date,
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      default: null
    },
    crmUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrmUser',
      default: null
    },
    appUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    workLocation: {
      type: String,
      trim: true,
      maxlength: 120
    },
    role: {
      type: String,
      enum: EMS_ROLES,
      default: 'employee'
    },
    password: {
      type: String,
      select: false
    },
    salary: {
      type: salarySchema,
      default: () => ({})
    },
    emergencyContact: {
      name: { type: String, trim: true },
      relation: { type: String, trim: true },
      phone: { type: String, trim: true }
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    archivedEmployeeId: {
      type: String,
      trim: true,
      uppercase: true
    },
    archivedEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  {
    collection: 'ems_employees',
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
)

employeeSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim()
})

employeeSchema.index({ employeeId: 1 }, { unique: true })
employeeSchema.index({ email: 1 }, { unique: true })
employeeSchema.index({ department: 1, status: 1 })
employeeSchema.index({ manager: 1 })
employeeSchema.index({ crmUserId: 1 })
employeeSchema.index({ appUserId: 1 })
employeeSchema.index({ isDeleted: 1 })

employeeSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return
  this.password = await bcrypt.hash(this.password, 12)
})

employeeSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return Promise.resolve(false)
  return bcrypt.compare(candidatePassword, this.password)
}

employeeSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.password
    delete ret.tokenVersion
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.models.EmsEmployee || mongoose.model('EmsEmployee', employeeSchema)
