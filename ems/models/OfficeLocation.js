const mongoose = require('mongoose')

const officeLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
      maxlength: 140
    },
    address: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: -180,
        max: 180
      }
    },
    radius: {
      type: Number,
      required: true,
      default: 100,
      min: 10,
      max: 5000
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
    collection: 'ems_office_locations',
    timestamps: true
  }
)

officeLocationSchema.index({ name: 1 }, { unique: true })
officeLocationSchema.index({ isActive: 1 })

module.exports = mongoose.models.EmsOfficeLocation || mongoose.model('EmsOfficeLocation', officeLocationSchema)
