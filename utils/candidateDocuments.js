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
  { key: 'educationCertificates', label: 'All Education Certificates' },
  { key: 'experienceLetter', label: 'Experience Letter' },
  {
    key: 'salarySlip',
    label: 'Salary Slip / Bank Statement',
    description: 'Previous 6 months with highlighted salary'
  },
  {
    key: 'computerCourseCertificate',
    label: 'Computer Courses Certificate',
    description: 'MS-CIT, Tally, Typing, Auto-Cad, Catia'
  },
  { key: 'aadharCard', label: 'Aadhar Card' },
  { key: 'panCard', label: 'PAN Card' },
  { key: 'passportSizePhoto', label: 'Passport Size Photo' },
  { key: 'medicalFitnessCertificate', label: 'Medical Fitness Certificates' },
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
    key: 'selectedVideoFeedbackVideo',
    label: 'Selected Video / Feedback Video',
    allowedMimeTypes: videoMimeTypes,
    allowedExtensions: videoExtensions
  },
  {
    key: 'candidatePhoto',
    label: 'Photo Of Candidates',
    allowedMimeTypes: imageMimeTypes,
    allowedExtensions: imageExtensions
  }
]

const candidateDocumentLabelByKey = candidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = doc.label
  return acc
}, {})

const candidateDocumentAllowedMimeTypesByKey = candidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = new Set(doc.allowedMimeTypes || imageMimeTypes)
  return acc
}, {})

const candidateDocumentAllowedExtensionsByKey = candidateDocumentTypes.reduce((acc, doc) => {
  acc[doc.key] = new Set(doc.allowedExtensions || imageExtensions)
  return acc
}, {})

const candidateDocumentUploadFields = candidateDocumentTypes.map((doc) => ({
  name: `documents.${doc.key}`,
  maxCount: 10
}))

const isCandidateDocumentKey = (key) =>
  Object.prototype.hasOwnProperty.call(candidateDocumentLabelByKey, key)

module.exports = {
  candidateDocumentTypes,
  candidateDocumentLabelByKey,
  candidateDocumentAllowedMimeTypesByKey,
  candidateDocumentAllowedExtensionsByKey,
  candidateDocumentUploadFields,
  isCandidateDocumentKey
}
