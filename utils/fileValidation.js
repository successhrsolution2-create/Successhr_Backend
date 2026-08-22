const path = require('path')
const fs = require('fs')

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf'])
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm'])
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

const fileSignatureBytes = (file) => {
  if (file?.buffer) return file.buffer
  if (!file?.path) return null

  try {
    const descriptor = fs.openSync(file.path, 'r')
    try {
      const buffer = Buffer.alloc(16)
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0)
      return buffer.subarray(0, bytesRead)
    } finally {
      fs.closeSync(descriptor)
    }
  } catch (_error) {
    return null
  }
}

const hasValidSignature = (file) => {
  const bytes = fileSignatureBytes(file)
  if (!bytes || bytes.length < 4) return false

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  const hasFtyp =
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3

  if (file.mimetype === 'image/jpeg') return isJpeg
  if (file.mimetype === 'image/png') return isPng
  if (file.mimetype === 'application/pdf') return isPdf
  if (file.mimetype === 'video/mp4' || file.mimetype === 'video/quicktime') return hasFtyp
  if (file.mimetype === 'video/webm') return isWebm

  return false
}

const validateUploadFile = (file, options = {}) => {
  const allowedMimeTypes = options.allowedMimeTypes || ALLOWED_MIME_TYPES
  const allowedExtensions = options.allowedExtensions || ALLOWED_EXTENSIONS
  const typeMessage = options.typeMessage || 'Only JPG, PNG, and PDF files are allowed'
  const extensionMessage = options.extensionMessage || 'Invalid file extension. Use .jpg, .jpeg, .png, or .pdf'

  if (!file) {
    const error = new Error('File is required')
    error.statusCode = 400
    throw error
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    const error = new Error(typeMessage)
    error.statusCode = 400
    throw error
  }

  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!allowedExtensions.has(ext)) {
    const error = new Error(extensionMessage)
    error.statusCode = 400
    throw error
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    const error = new Error('File size must be greater than 0 and up to 50MB')
    error.statusCode = 400
    throw error
  }

  if (!hasValidSignature(file)) {
    const error = new Error('File content does not match the selected file type')
    error.statusCode = 400
    throw error
  }
}

const validateImageUploadFile = (file) => {
  validateUploadFile(file)

  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    const error = new Error('Only JPG and PNG image files are allowed')
    error.statusCode = 400
    throw error
  }

  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!IMAGE_EXTENSIONS.has(ext)) {
    const error = new Error('Invalid file extension. Use .jpg, .jpeg, or .png')
    error.statusCode = 400
    throw error
  }
}

module.exports = {
  validateUploadFile,
  validateImageUploadFile,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  VIDEO_MIME_TYPES,
  VIDEO_EXTENSIONS,
  IMAGE_MIME_TYPES
}
