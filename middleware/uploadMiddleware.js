const multer = require('multer')

const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm']
const imageTypes = ['image/jpeg', 'image/png']

const createFileFilter = (types, message) => (_req, file, cb) => {
  if (types.includes(file.mimetype)) {
    cb(null, true)
    return
  }

  cb(new Error(message))
}

const createUpload = (types, message, extraLimits = {}) => multer({
  storage: multer.memoryStorage(),
  fileFilter: createFileFilter(types, message),
  limits: {
    fileSize: 10 * 1024 * 1024,
    ...extraLimits
  }
})

const upload = createUpload(allowedTypes, 'Only JPG, PNG, and PDF files are allowed')
const imageUpload = createUpload(imageTypes, 'Only JPG and PNG image files are allowed', { files: 40 })
const candidateDocumentUpload = createUpload(
  [...allowedTypes, ...videoTypes],
  'Only JPG, PNG, PDF, MP4, MOV, and WebM files are allowed',
  { files: 40 }
)

module.exports = upload
module.exports.imageUpload = imageUpload
module.exports.candidateDocumentUpload = candidateDocumentUpload
