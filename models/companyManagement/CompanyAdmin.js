const mongoose = require('mongoose')

const companyAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    mobileNo: {
      type: String,
      trim: true,
      maxlength: 10
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true, collection: 'company_admins' }
)

companyAdminSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.tokenVersion
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.model('CompanyAdmin', companyAdminSchema)
