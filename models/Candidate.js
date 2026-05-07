const mongoose = require('mongoose')

const statusValues = ['not_viewed', 'in_review', 'priority', 'done']
const selectionStatuses = ['shortlisted', 'selected', 'joined', 'rejected', 'on_hold']

const candidateSchema = new mongoose.Schema(
  {
    candidateName: {
      type: String,
      required: true,
      trim: true
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true
    },
    aadhaarNo: String,
    whatsappNo: String,
    emailId: String,
    appliedFor: String,
    interestedDepartment: String,
    preferredIndustry: String,
    preferredJobLocation: String,
    education: String,
    totalExperience: Number,
    currentCompany: String,
    careerSummary: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: Number,
    reasonForJobChange: String,
    currentJobLocation: String,
    availabilityForInterview: String,
    marriageStatus: {
      type: String,
      enum: ['Married', 'Unmarried', 'Single']
    },
    documents: [
      {
        fileName: String,
        fileUrl: String,
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    source: {
      type: String,
      enum: ['admin_panel', 'public_form'],
      default: 'admin_panel'
    },
    status: {
      type: String,
      enum: statusValues,
      default: 'not_viewed'
    },
    priorityOrder: {
      type: Number,
      default: 0
    },
    adminNotes: String,
    selectionStatus: {
      type: String,
      enum: selectionStatuses
    }
  },
  { timestamps: true, collection: 'candidates' }
)

candidateSchema.statics.statusValues = statusValues
candidateSchema.statics.selectionStatuses = selectionStatuses

module.exports = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema)
