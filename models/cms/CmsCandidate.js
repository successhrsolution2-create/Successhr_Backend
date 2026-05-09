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
    candidateCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    aadhaarNo: String,
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
    careerSummary: String,
    currentDesignation: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: String,
    keySkills: [String],
    preferredLocation: String,
    marriageStatus: { type: String, enum: ['Married', 'Unmarried', 'Single'] },
    languagesKnown: [String],
    appliedFor: String,
    interestedDepartment: String,
    preferredIndustry: String,
    preferredJobLocation: String,
    availabilityForInterview: String,
    reasonForJobChange: String,
    currentJobLocation: String,
    source: {
      type: String,
      enum: ['admin_panel', 'public_form'],
      default: 'admin_panel'
    },
    intakeType: {
      type: String,
      enum: ['walkin', 'advisor', 'admin'],
      default: 'admin'
    },
    advisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    advisorCode: String,
    referenceName: String,
    successRemarks: {
      selected: remarkFlag,
      joined: remarkFlag,
      notSelected: remarkFlag,
      rejected: remarkFlag,
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
