const mongoose = require('mongoose')

const { ATTENDANCE_STATUSES } = require('../config/emsConstants')

const coordinatesSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number
  },
  { _id: false }
)

const punchSchema = new mongoose.Schema(
  {
    time: Date,
    coordinates: coordinatesSchema,
    distanceFromOffice: {
      type: Number,
      min: 0
    }
  },
  { _id: false }
)

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    officeLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsOfficeLocation',
      default: null
    },
    date: {
      type: Date,
      required: true
    },
    checkIn: {
      type: punchSchema,
      default: null
    },
    checkOut: {
      type: punchSchema,
      default: null
    },
    workingHours: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: 'present'
    },
    minutesWorked: {
      type: Number,
      default: 0,
      min: 0
    },
    isLate: {
      type: Boolean,
      default: false
    },
    lateByMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    earlyExitMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    isOverride: {
      type: Boolean,
      default: false
    },
    overrideReason: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    overrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    overrideAt: Date,
    notes: {
      type: String,
      trim: true,
      maxlength: 1000
    }
  },
  {
    collection: 'ems_attendance',
    timestamps: true
  }
)

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true })
attendanceSchema.index({ date: 1, status: 1 })
attendanceSchema.index({ officeLocation: 1, date: 1 })

module.exports = mongoose.models.EmsAttendance || mongoose.model('EmsAttendance', attendanceSchema)
