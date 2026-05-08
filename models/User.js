const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
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
    }
  },
  { timestamps: true }
)

userSchema.index({ advisorCode: 1 }, { unique: true, sparse: true })

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.model('User', userSchema)
