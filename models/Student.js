const mongoose = require('mongoose')

const statusValues = ['not_viewed', 'in_review', 'priority', 'done']
const selectionStatuses = ['shortlisted', 'selected', 'joined', 'rejected', 'on_hold']

const studentSchema = new mongoose.Schema(
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
  { timestamps: true }
)

studentSchema.statics.statusValues = statusValues
studentSchema.statics.selectionStatuses = selectionStatuses

module.exports = mongoose.model('Student', studentSchema)
