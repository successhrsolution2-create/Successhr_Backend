const mongoose = require('mongoose')

const cmsInterviewSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CmsCandidate',
      required: true
    },
    candidateName: String,
    companyName: { type: String, required: true, trim: true },
    jobRole: { type: String, trim: true },
    reference: String,
    hrRecruiterName: String,
    attendInterview: String,
    interestedForJoin: String,
    interviewDate: Date,
    selectionChances: String,
    ratingForCompany: Number,
    notAttendRemark: String,
    notInterestedReason: String,
    replyFromCompany: String,
    positiveFeedback: String,
    negativeFeedback: String,
    overallDiscussion: String,
    note: String,
    updatedBy: String,
    documents: [
      {
        documentType: String,
        documentLabel: String,
        fileName: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date
      }
    ],
    remark: String,
    result: { type: String, enum: ['Pending', 'Selected', 'Rejected', 'On Hold'], default: 'Pending' }
  },
  { timestamps: true, collection: 'cms_interviews' }
)

cmsInterviewSchema.index({ candidateId: 1 })

module.exports = mongoose.model('CmsInterview', cmsInterviewSchema)
