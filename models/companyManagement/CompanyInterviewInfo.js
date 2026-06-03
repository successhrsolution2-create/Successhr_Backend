const mongoose = require('mongoose')

const companyInterviewInfoSchema = new mongoose.Schema(
  {
    companyAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyAdmin',
      required: true,
      unique: true,
      index: true
    },
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
    }
  },
  { timestamps: true, collection: 'company_interview_info' }
)

module.exports = mongoose.model('CompanyInterviewInfo', companyInterviewInfoSchema)
