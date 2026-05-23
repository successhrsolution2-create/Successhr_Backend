const mongoose = require('mongoose')

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: 120
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      trim: true,
      uppercase: true,
      maxlength: 24
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      default: null
    },
    openPositions: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
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
    collection: 'ems_departments',
    timestamps: true
  }
)

departmentSchema.index({ code: 1 }, { unique: true })
departmentSchema.index({ name: 1 }, { unique: true })
departmentSchema.index({ status: 1 })

module.exports = mongoose.models.EmsDepartment || mongoose.model('EmsDepartment', departmentSchema)
