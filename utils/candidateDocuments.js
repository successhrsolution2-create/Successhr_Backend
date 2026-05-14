const imageMimeTypes = ['image/jpeg', 'image/png']
const letterMimeTypes = ['image/jpeg', 'image/png', 'application/pdf']
const videoMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm']

const imageExtensions = ['.jpg', '.jpeg', '.png']
const letterExtensions = ['.jpg', '.jpeg', '.png', '.pdf']
const videoExtensions = ['.mp4', '.mov', '.webm']

const candidateDocumentTypes = [
  {
    key: 'updatedResume',
    label: 'Updated Resume',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'tenthCertificate',
    label: '10th Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'twelfthCertificate',
    label: '12th Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'graduateCertificate',
    label: 'Graduate Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'postGraduateCertificate',
    label: 'Post Graduate Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'experienceLetter',
    label: 'Experience Letter',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'salarySlip',
    label: 'Salary Slip',
    description: 'Previous 6 months with highlighted salary',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'bankStatement',
    label: 'Bank Statement',
    description: 'Previous 6 months with highlighted salary',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'msCitCertificate',
    label: 'MS-CIT Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'cccCertificate',
    label: 'CCC Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'advancedExcelCertificate',
    label: 'Advanced Excel Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'powerPointCertificate',
    label: 'PowerPoint Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'tallyCertificate',
    label: 'Tally Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'autoCadCertificate',
    label: 'AutoCAD Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'typingCertificate',
    label: 'Typing Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'catiaCertificate',
    label: 'CATIA Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'computerCourseCertificate',
    label: 'Other Computer Course Certificate',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'aadharCard',
    label: 'Aadhar Card',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'panCard',
    label: 'PAN Card',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  { key: 'passportSizePhoto', label: 'Passport Size Photo' },
  {
    key: 'medicalFitnessCertificate',
    label: 'Medical Fitness Certificates',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'candidatePhoto',
    label: 'Photo Of Candidate With Letter / Receipt',
    allowedMimeTypes: imageMimeTypes,
    allowedExtensions: imageExtensions
  }
]

const successDocumentTypes = [
  {
    key: 'hamiPatra',
    label: 'HP - Hami Patra',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'concernLetter',
    label: 'CL - Concern Letter',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  },
  {
    key: 'selectedVideo',
    label: 'Selected Video / Feedback Video',
    allowedMimeTypes: videoMimeTypes,
    allowedExtensions: videoExtensions
  },
  {
    key: 'jobJoiningHamiPatra',
    label: 'Job Joining Hami Patra',
    allowedMimeTypes: letterMimeTypes,
    allowedExtensions: letterExtensions
  }
]

const allCandidateDocumentTypes = [...candidateDocumentTypes, ...successDocumentTypes]

const candidateDocumentLabelByKey = allCandidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = doc.label
  return acc
}, {})

const candidateDocumentAllowedMimeTypesByKey = allCandidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = new Set(doc.allowedMimeTypes || imageMimeTypes)
  return acc
}, {})

const candidateDocumentAllowedExtensionsByKey = allCandidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = new Set(doc.allowedExtensions || imageExtensions)
  return acc
}, {})

const candidateDocumentUploadFields = allCandidateDocumentTypes.map((doc) => ({
  name: `documents.${doc.key}`,
  maxCount: 10
}))

const isCandidateDocumentKey = (key) =>
  Object.prototype.hasOwnProperty.call(candidateDocumentLabelByKey, key)

module.exports = {
  candidateDocumentTypes,
  successDocumentTypes,
  allCandidateDocumentTypes,
  candidateDocumentLabelByKey,
  candidateDocumentAllowedMimeTypesByKey,
  candidateDocumentAllowedExtensionsByKey,
  candidateDocumentUploadFields,
  isCandidateDocumentKey
}
