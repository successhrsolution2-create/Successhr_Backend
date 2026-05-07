const mongoose = require('mongoose')

const checkboxField = {
  checked: {
    type: Boolean,
    default: false
  },
  updatedAt: Date
}

const cmsRemarkSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CmsCandidate',
      required: true,
      unique: true
    },
    checkboxes: {
      documentsSubmitted: checkboxField,
      offerLetterReceived: checkboxField,
      appointmentLetterGiven: checkboxField,
      joiningDateConfirmed: checkboxField,
      joiningCompleted: checkboxField,
      pfEnrolled: checkboxField,
      esicEnrolled: checkboxField,
      backgroundCheckDone: checkboxField,
      trainingCompleted: checkboxField,
      idCardIssued: checkboxField,
      uniformProvided: checkboxField,
      salaryAccountOpened: checkboxField,
      firstSalaryReceived: checkboxField,
      probationCompleted: checkboxField,
      permanentEmployment: checkboxField,
      exitFormalitiesDone: checkboxField,
      noDuesCertificate: checkboxField,
      experienceLetterGiven: checkboxField,
      relievingLetterGiven: checkboxField,
      feedbackCollected: checkboxField
    }
  },
  { timestamps: true, collection: 'cms_remarks' }
)

module.exports = mongoose.model('CmsRemark', cmsRemarkSchema)
