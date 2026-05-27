const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const { Schema } = mongoose

const CRM_ROLES = ['crm_super_admin', 'crm_employee']
const BCRYPT_SALT_ROUNDS = 12

const crmUserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [120, 'Name cannot exceed 120 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: [180, 'Email cannot exceed 180 characters'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false
    },
    role: {
      type: String,
      enum: {
        values: CRM_ROLES,
        message: 'Invalid CRM role'
      },
      required: [true, 'CRM role is required']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'CrmUser',
      default: null
    }
  },
  {
    collection: 'crm_users',
    timestamps: true
  }
)

crmUserSchema.index({ email: 1 }, { unique: true })
crmUserSchema.index({ employeeId: 1 }, { unique: true, sparse: true })
crmUserSchema.index({ role: 1, isActive: 1 })
crmUserSchema.index({ createdBy: 1 })

crmUserSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return

  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS)
})

crmUserSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

crmUserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.tokenVersion
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.models.CrmUser || mongoose.model('CrmUser', crmUserSchema)
module.exports.CRM_ROLES = CRM_ROLES
