const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
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
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['superAdmin', 'businessAdvisor', 'candidateAdmin'],
      required: true
    },
    advisorCode: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+$/
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
  { timestamps: true }
)

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.tokenVersion
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.model('User', userSchema)
