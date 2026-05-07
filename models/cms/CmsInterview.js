const mongoose = require('mongoose')

const cmsInterviewSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CmsCandidate',
      required: true
    },
    companyName: { type: String, required: true, trim: true },
    reference: String,
    interviewDate: Date,
    remark: String,
    result: { type: String, enum: ['Pending', 'Selected', 'Rejected', 'On Hold'], default: 'Pending' }
  },
  { timestamps: true, collection: 'cms_interviews' }
)

module.exports = mongoose.model('CmsInterview', cmsInterviewSchema)
