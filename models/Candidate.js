const mongoose = require('mongoose')

const statusValues = ['not_viewed', 'in_review', 'priority', 'done']
const selectionStatuses = ['shortlisted', 'selected', 'joined', 'rejected', 'on_hold']

const candidateSchema = new mongoose.Schema(
  {
    formMeta: {
      day: String,
      receiptNo: String,
      rcWrc: String,
      date: Date
    },
    candidateName: {
      type: String,
      required: true,
      trim: true
    },
    collegeName: String,
    mobileNumber: {
      type: String,
      required: true,
      trim: true
    },
    aadhaarNo: String,
    panNo: String,
    whatsappNo: String,
    emailId: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    },
    currentAge: Number,
    currentAddress: String,
    permanentAddress: String,
    appliedFor: String,
    interestedDepartment: String,
    lookingForField: String,
    preferredIndustry: String,
    preferredJobLocation: String,
    education: String,
    yearOfHigherEducation: String,
    computerCourses: String,
    otherAchievements: String,
    placementReference: {
      professorName: String,
      professorContactNumber: String,
      referenceBy: String,
      referenceContactNumber: String
    },
    totalExperience: Number,
    experienceDepartment: String,
    currentCompany: String,
    keyResponsibilities: String,
    careerSummary: String,
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: Number,
    reasonForJobChange: String,
    currentJobLocation: String,
    currentJobLocationOther: String,
    currentJobLocationMidcArea: String,
    currentJobLocationMidcAreaOther: String,
    availabilityForInterview: String,
    interviewMode: String,
    marriageStatus: {
      type: String,
      enum: ['Married', 'Unmarried', 'Single', 'Widow']
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
      siblingEducation: String,
      siblingMobileNumber: String,
      siblingDateOfBirth: Date,
      siblingAge: Number,
      siblingGender: {
        type: String,
        enum: ['Male', 'Female', 'Other']
      },
      siblingStudyStandard: String,
      siblingStudyStandardOther: String,
      siblingCareerProfile: String,
      siblingCareerProfileOther: String,
      brotherOccupation: String,
      sisterOccupation: String
    },
    goalAim: String,
    feedback: String,
    suggestion: String,
    applicationDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
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
      candidateDataSource: String,
      googleForm: String,
      justDialGoogleFeedback: String,
      selectedVideoFeedbackVideo: String,
      hrContactDetails: String,
      witnessName: String,
      witnessMobileNumber: String,
      witnessEducation: String,
      witnessCareerProfile: String,
      witnessRelation: String,
      witnessRelationOther: String,
      witnesses: [
        {
          witnessName: String,
          witnessMobileNumber: String,
          witnessEducation: String,
          witnessCareerProfile: String,
          witnessRelation: String,
          witnessRelationOther: String
        }
      ],
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
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    source: {
      type: String,
      enum: ['admin_panel', 'public_form'],
      default: 'admin_panel'
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
    },
    advisorCommission: {
      salary: {
        type: Number,
        default: 0
      },
      percentage: {
        type: Number,
        default: 0
      },
      amount: {
        type: Number,
        default: 0
      },
      paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
      },
      paidAt: Date
    }
  },
  { timestamps: true, collection: 'candidates' }
)

candidateSchema.statics.statusValues = statusValues
candidateSchema.statics.selectionStatuses = selectionStatuses

module.exports = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema)
