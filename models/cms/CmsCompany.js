const mongoose = require('mongoose')

const cmsCompanySchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true, collection: 'cms_companies' }
)

module.exports = mongoose.model('CmsCompany', cmsCompanySchema)
