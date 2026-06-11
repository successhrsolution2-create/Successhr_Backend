const mongoose = require('mongoose')

const companyVacancySchema = new mongoose.Schema(
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
    jobProfile: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    department: {
      type: String,
      trim: true,
      maxlength: 180
    },
    numberOfVacancy: Number,
    education: {
      type: String,
      trim: true,
      maxlength: 180
    },
    experience: {
      type: String,
      trim: true,
      maxlength: 120
    },
    salaryRange: {
      type: String,
      trim: true,
      maxlength: 120
    },
    jobTime: {
      type: String,
      trim: true,
      maxlength: 120
    },
    shift: {
      type: String,
      trim: true,
      maxlength: 120
    },
    jobLocation: {
      type: String,
      trim: true,
      maxlength: 300
    },
    requiredKeySkills: [String],
    rolesAndResponsibility: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    facilities: [String],
    weeklyOff: [String],
    manpower: {
      type: String,
      trim: true,
      maxlength: 120
    },
    turnover: {
      type: String,
      trim: true,
      maxlength: 120
    },
    plant: {
      type: String,
      trim: true,
      maxlength: 180
    }
  },
  { timestamps: true, collection: 'company_vacancies' }
)

companyVacancySchema.index({ companyAdminId: 1, createdAt: -1 })
companyVacancySchema.index({ jobProfile: 1, companyName: 1 })

module.exports = mongoose.model('CompanyVacancy', companyVacancySchema)
