const mongoose = require('mongoose')

const { Schema } = mongoose

const INTERESTED_STATUSES = ['yes', 'no']
const CANDIDATE_CLASSES = ['1st', '2nd', '3rd']
const REGISTRATION_INFO = ['RC', 'WRC', 'RC data', 'WRC data', 'College contacts']
const CALL_STATUSES = ['pending', 'called', 'followup', 'converted', 'rejected']

const interestedSchema = new Schema(
  {
    status: {
      type: String,
      enum: {
        values: INTERESTED_STATUSES,
        message: 'Interested status must be yes or no'
      },
      required: [true, 'Interested status is required']
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [1000, 'Reason for not interested cannot exceed 1000 characters'],
      required() {
        return this.status === 'no'
      }
    }
  },
  { _id: false }
)

const crmCandidateSchema = new Schema(
  {
    candidateName: {
      type: String,
      required: [true, 'Candidate name is required'],
      trim: true,
      minlength: [2, 'Candidate name must be at least 2 characters'],
      maxlength: [150, 'Candidate name cannot exceed 150 characters']
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      validate: {
        validator(value) {
          return /^[0-9]{10}$/.test(value)
        },
        message: 'Mobile number must be exactly 10 digits'
      }
    },
    education: {
      type: String,
      required: [true, 'Education is required'],
      trim: true,
      maxlength: [150, 'Education cannot exceed 150 characters']
    },
    jobNo: {
      type: String,
      required: [true, 'Job number is required'],
      trim: true,
      maxlength: [80, 'Job number cannot exceed 80 characters']
    },
    jobProfile: {
      type: String,
      required: [true, 'Job profile is required'],
      trim: true,
      maxlength: [180, 'Job profile cannot exceed 180 characters']
    },
    interested: {
      type: interestedSchema
    },
    availabilityForInterview: {
      type: String,
      required: [true, 'Availability for interview is required'],
      trim: true,
      maxlength: [180, 'Availability cannot exceed 180 characters']
    },
    interviewDate: {
      type: String,
      trim: true,
      maxlength: [30, 'Interview date cannot exceed 30 characters']
    },
    interviewTime: {
      type: String,
      required: [true, 'Interview time is required'],
      trim: true,
      maxlength: [120, 'Interview time cannot exceed 120 characters']
    },
    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmUser',
      required: [true, 'Recruiter is required']
    },
    overallCallingRemark: {
      type: String,
      required: [true, 'Overall calling remark is required'],
      trim: true,
      maxlength: [3000, 'Overall calling remark cannot exceed 3000 characters']
    },
    candidateClass: {
      type: String,
      enum: {
        values: CANDIDATE_CLASSES,
        message: 'Candidate class must be 1st, 2nd, or 3rd'
      },
      required: [true, 'Candidate class is required']
    },
    registrationInfo: {
      type: String,
      enum: {
        values: REGISTRATION_INFO,
        message: 'Source must be RC data, WRC data, or College contacts'
      },
      required: [true, 'Source is required']
    },
    callStatus: {
      type: String,
      enum: {
        values: CALL_STATUSES,
        message: 'Invalid call status'
      },
      default: 'pending'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    collection: 'crm_candidates',
    timestamps: true
  }
)

crmCandidateSchema.pre('validate', function clearUnusedReason() {
  if (this.interested?.status === 'yes') {
    this.interested.reason = undefined
  }
})

crmCandidateSchema.index({ mobileNumber: 1 }, { unique: true })
crmCandidateSchema.index({ recruiterId: 1 })
crmCandidateSchema.index({ candidateClass: 1 })
crmCandidateSchema.index({ callStatus: 1 })
crmCandidateSchema.index({ recruiterId: 1, isActive: 1, createdAt: -1 })
crmCandidateSchema.index({ callStatus: 1, candidateClass: 1 })

crmCandidateSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.models.CrmCandidate || mongoose.model('CrmCandidate', crmCandidateSchema)
module.exports.INTERESTED_STATUSES = INTERESTED_STATUSES
module.exports.CANDIDATE_CLASSES = CANDIDATE_CLASSES
module.exports.REGISTRATION_INFO = REGISTRATION_INFO
module.exports.CALL_STATUSES = CALL_STATUSES
