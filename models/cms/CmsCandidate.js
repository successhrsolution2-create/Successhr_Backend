const mongoose = require('mongoose')

const remarkFlag = {
  checked: {
    type: Boolean,
    default: false
  },
  updatedAt: Date
}

const cmsCandidateSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    whatsappNo: String,
    emailId: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    currentAddress: String,
    permanentAddress: String,
    education: String,
    specialization: String,
    totalExperience: Number,
    currentCompany: String,
    currentDesignation: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: String,
    keySkills: [String],
    preferredLocation: String,
    marriageStatus: { type: String, enum: ['Married', 'Unmarried', 'Single'] },
    languagesKnown: [String],
    successRemarks: {
      resumeReady: remarkFlag,
      educationVerified: remarkFlag,
      experienceVerified: remarkFlag,
      skillsAssessed: remarkFlag,
      backgroundChecked: remarkFlag,
      referenceVerified: remarkFlag,
      documentsCollected: remarkFlag,
      salaryNegotiated: remarkFlag,
      offerAccepted: remarkFlag,
      joiningConfirmed: remarkFlag
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true, collection: 'cms_candidates' }
)

module.exports = mongoose.model('CmsCandidate', cmsCandidateSchema)
