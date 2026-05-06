const path = require('path')

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf'])

const hasValidSignature = (file) => {
  const bytes = file?.buffer
  if (!bytes || bytes.length < 4) return false

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46

  if (file.mimetype === 'image/jpeg') return isJpeg
  if (file.mimetype === 'image/png') return isPng
  if (file.mimetype === 'application/pdf') return isPdf

  return false
}

const validateUploadFile = (file) => {
  if (!file) {
    const error = new Error('File is required')
    error.statusCode = 400
    throw error
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error('Only JPG, PNG, and PDF files are allowed')
    error.statusCode = 400
    throw error
  }

  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error('Invalid file extension. Use .jpg, .jpeg, .png, or .pdf')
    error.statusCode = 400
    throw error
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    const error = new Error('File size must be greater than 0 and up to 5MB')
    error.statusCode = 400
    throw error
  }

  if (!hasValidSignature(file)) {
    const error = new Error('File content does not match the selected file type')
    error.statusCode = 400
    throw error
  }
}

module.exports = {
  validateUploadFile,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
}
