const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema(
  {
    fileName: String,
    fileUrl: String,
    mimeType: String,
    size: Number,
    uploadedAt: Date
  },
  { _id: false }
)

const companyInterviewInfoSchema = new mongoose.Schema(
  {
    companyAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyAdmin',
      required: true,
      index: true
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    candidateInterview: {
      resume: fileSchema,
      candidateName: {
        type: String,
        trim: true,
        required: true
      },
      gender: {
        type: String,
        enum: ['Male', 'Female', 'Other']
      },
      education: String,
      department: String,
      interviewDateTime: Date,
      attendedInterview: {
        type: String,
        enum: ['Yes', 'No']
      },
      interestedForJoin: {
        type: String,
        enum: ['Yes', 'No']
      },
      notInterestedReason: String,
      feedbackFromCompany: {
        type: String,
        enum: ['Yes', 'No', 'Pending'],
        default: 'Pending'
      },
      feedbackFromPlacement: {
        type: String,
        enum: ['Yes', 'No', 'Pending'],
        default: 'Pending'
      },
      interviewStatus: {
        type: String,
        enum: ['Selected', 'Rejected', 'Hold', 'Pending'],
        default: 'Pending'
      },
      offerDetails: {
        netSalary: Number,
        grossSalary: Number,
        ctc: Number,
        offerLetter: fileSchema,
        appointmentLetter: fileSchema,
        department: String,
        expectedDoj: Date
      }
    },
    manpowerVacancy: {
      jobProfile: String,
      department: String,
      numberOfVacancy: Number,
      education: String,
      experience: String,
      salaryRange: String,
      jobTime: String,
      shift: String,
      jobLocation: String,
      requiredKeySkills: [String],
      rolesAndResponsibility: String,
      facilities: [String],
      weeklyOff: [String],
      manpower: String,
      turnover: String,
      plant: String
    },
    companyAddress: String,
    contactPersonName: String,
    contactPersonDesignation: String,
    mobileNo: String,
    emailId: String,
    jobRequirements: {
      jobProfile: String,
      education: String,
      experience: String,
      requiredKeySkills: [String],
      rolesAndResponsibility: String,
      salaryRange: String,
      gender: {
        type: String,
        enum: ['Male', 'Female', 'Any']
      },
      numberOfVacancy: Number,
      jobTime: String,
      shift: String,
      jobLocation: String,
      ageCriteria: String,
      castCriteria: String,
      marriageCriteria: {
        type: String,
        enum: ['Married', 'Unmarried', 'Any']
      },
      facilities: [String]
    },
    aboutCompany: {
      manpower: String,
      turnover: String,
      plant: String,
      availabilityForInterview: {
        date: Date,
        time: String
      },
      interviewMode: {
        type: String,
        enum: ['Online', 'Offline']
      },
      weeklyOff: [String]
    }
  },
  { timestamps: true, collection: 'company_interview_info' }
)

companyInterviewInfoSchema.index({ companyAdminId: 1, createdAt: -1 })
companyInterviewInfoSchema.index({ 'candidateInterview.candidateName': 1 })

module.exports = mongoose.model('CompanyInterviewInfo', companyInterviewInfoSchema)
