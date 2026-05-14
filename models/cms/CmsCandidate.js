const mongoose = require('mongoose')

const remarkFlag = {
  checked: {
    type: Boolean,
    default: false
  },
  updatedAt: Date
}

const interviewQuestionSchema = new mongoose.Schema(
  {
    question: String,
    choices: [{ type: String, enum: ['A', 'B', 'C'] }],
    marks: String
  },
  { _id: false }
)

const cmsCandidateSchema = new mongoose.Schema(
  {
    formMeta: {
      day: String,
      receiptNo: String,
      rcWrc: String,
      date: Date
    },
    candidateCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    fullName: { type: String, required: true, trim: true },
    collegeName: String,
    mobileNumber: { type: String, required: true, trim: true },
    aadhaarNo: String,
    panNo: String,
    whatsappNo: String,
    emailId: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    currentAge: Number,
    currentAddress: String,
    permanentAddress: String,
    education: String,
    yearOfHigherEducation: String,
    computerCourses: String,
    otherAchievements: String,
    specialization: String,
    totalExperience: Number,
    experienceDepartment: String,
    currentCompany: String,
    lookingForField: String,
    keyResponsibilities: String,
    careerSummary: String,
    currentDesignation: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: String,
    keySkills: [String],
    preferredLocation: String,
    marriageStatus: { type: String, enum: ['Married', 'Unmarried', 'Single', 'Widow'] },
    languagesKnown: [String],
    appliedFor: String,
    interestedDepartment: String,
    preferredIndustry: String,
    preferredJobLocation: String,
    availabilityForInterview: String,
    reasonForJobChange: String,
    currentJobLocation: String,
    placementReference: {
      professorName: String,
      professorContactNumber: String,
      referenceBy: String,
      referenceContactNumber: String
    },
    familyDetails: {
      fatherOrHusbandName: String,
      fatherOccupation: String,
      fatherMobileNumber: String,
      motherOrWifeName: String,
      motherOccupation: String,
      motherMobileNumber: String,
      siblingName: String,
      siblingEducationOccupation: String,
      brotherOccupation: String,
      sisterOccupation: String
    },
    applicationDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    goalAim: String,
    feedback: String,
    suggestion: String,
    successInfo: {
      hamiPatra: String,
      concernLetter: String,
      numberSave: String,
      groupJoin: String,
      bwType: String,
      byWhichStaff: String,
      candidateClass: String,
      alternateNumbers: String,
      relation: String,
      reference: String,
      referenceMobileNo: String,
      whatsappChannelCommunity: String,
      candidateRegistrationStatus: String,
      candidateDataSource: String,
      googleForm: String,
      justDialGoogleFeedback: String,
      selectedVideoFeedbackVideo: String,
      hrContactDetails: String,
      candidatePhoto: String,
      rcWrcStatus: String,
      interviewAttainedList: String
    },
    documents: [
      {
        documentType: String,
        documentLabel: String,
        fileName: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    interviewForm: {
      suitableIndustry: String,
      suitableDepartment: String,
      hrInterviewer: String,
      remark: String,
      professionalRatings: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
      },
      personalityRatings: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
      },
      directorAssessment: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
      },
      managerAssessment: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
      },
      iqSelections: [Number],
      tqSelections: [Number],
      grade: String,
      questions: [interviewQuestionSchema]
    },
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
    sourceCandidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
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
