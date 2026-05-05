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
      enum: ['superAdmin', 'businessAdvisor'],
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
)

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.model('User', userSchema)
