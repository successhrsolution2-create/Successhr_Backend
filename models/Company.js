const mongoose = require('mongoose')

const statusValues = ['not_viewed', 'in_review', 'priority', 'done']

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true
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
    },
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
    adminNotes: String
  },
  { timestamps: true }
)

companySchema.statics.statusValues = statusValues

module.exports = mongoose.model('Company', companySchema)
