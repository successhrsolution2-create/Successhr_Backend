const mongoose = require('mongoose')

const cmsPdfShareSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CmsCandidate',
      required: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ['success-remark-pdf'],
      default: 'success-remark-pdf',
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true, collection: 'cms_pdf_shares' }
)

cmsPdfShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('CmsPdfShare', cmsPdfShareSchema)
