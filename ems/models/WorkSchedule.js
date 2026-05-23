const mongoose = require('mongoose')

const { WORK_DAYS } = require('../config/emsConstants')

const workScheduleSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    officeLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsOfficeLocation',
      required: true
    },
    workDays: {
      type: [String],
      enum: WORK_DAYS,
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    },
    shiftStart: {
      type: String,
      required: true,
      default: '09:00',
      match: /^([01]\d|2[0-3]):[0-5]\d$/
    },
    shiftEnd: {
      type: String,
      required: true,
      default: '18:00',
      match: /^([01]\d|2[0-3]):[0-5]\d$/
    },
    graceMinutes: {
      type: Number,
      default: 15,
      min: 0,
      max: 240
    },
    isActive: {
      type: Boolean,
      default: true
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
    collection: 'ems_work_schedules',
    timestamps: true
  }
)

workScheduleSchema.index({ employee: 1, isActive: 1 })
workScheduleSchema.index({ officeLocation: 1, isActive: 1 })

module.exports = mongoose.models.EmsWorkSchedule || mongoose.model('EmsWorkSchedule', workScheduleSchema)
