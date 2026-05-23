const mongoose = require('mongoose')

const { DOCUMENT_TYPES } = require('../config/emsConstants')

const documentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmsEmployee',
      required: true
    },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      default: 'Other'
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    fileName: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    expiryDate: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  {
    collection: 'ems_documents',
    timestamps: true
  }
)

documentSchema.index({ employee: 1, documentType: 1 })
documentSchema.index({ expiryDate: 1 })

module.exports = mongoose.models.EmsDocument || mongoose.model('EmsDocument', documentSchema)
