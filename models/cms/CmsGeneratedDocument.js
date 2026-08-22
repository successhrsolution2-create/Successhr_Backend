const mongoose = require('mongoose')

const CmsGeneratedDocumentSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CmsCandidate',
      required: true
    },
    documentType: {
      type: String,
      required: true,
      enum: ['Interview Letter', 'Receipt', 'Consent Letter', 'Hami patra']
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {}
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('CmsGeneratedDocument', CmsGeneratedDocumentSchema)
