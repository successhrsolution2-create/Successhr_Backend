const fsp = require('fs/promises')
const path = require('path')
const multer = require('multer')

const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm']
const imageTypes = ['image/jpeg', 'image/png']
const uploadTempRoot = path.join(__dirname, '..', 'tmp', 'uploads')
const resolvedTempRoot = path.resolve(uploadTempRoot)

const sanitizeName = (name) => String(name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')

const diskStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fsp.mkdir(uploadTempRoot, { recursive: true })
      cb(null, uploadTempRoot)
    } catch (error) {
      cb(error)
    }
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeName(file.originalname)}`)
  }
})

const createFileFilter = (types, message) => (_req, file, cb) => {
  if (types.includes(file.mimetype)) {
    cb(null, true)
    return
  }

  cb(new Error(message))
}

const createUpload = (types, message, extraLimits = {}) => multer({
  storage: diskStorage,
  fileFilter: createFileFilter(types, message),
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 256 * 1024,
    fields: 50,
    parts: 100,
    ...extraLimits
  }
})

const upload = createUpload(allowedTypes, 'Only JPG, PNG, and PDF files are allowed')
const imageUpload = createUpload(imageTypes, 'Only JPG and PNG image files are allowed', { files: 40 })
const candidateDocumentUpload = createUpload(
  [...allowedTypes, ...videoTypes],
  'Only JPG, PNG, PDF, MP4, MOV, and WebM files are allowed',
  {
    files: 40,
    fields: 200,
    parts: 260
  }
)

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if ((file.originalname || '').toLowerCase().endsWith('.xlsx')) {
      cb(null, true)
      return
    }

    const error = new Error('Only .xlsx Excel files are allowed')
    error.statusCode = 400
    cb(error)
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 256 * 1024,
    fields: 5,
    parts: 10,
    files: 1
  }
})

const collectFiles = (req) => {
  const files = []

  if (req.file) files.push(req.file)

  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((value) => {
      if (Array.isArray(value)) files.push(...value)
      else if (value) files.push(value)
    })
  }

  return files
}

const cleanupTempFile = async (file) => {
  if (!file?.path) return

  const filePath = path.resolve(file.path)
  if (!filePath.startsWith(`${resolvedTempRoot}${path.sep}`)) return

  try {
    await fsp.unlink(filePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not clean temp upload ${filePath}: ${error.message}`)
    }
  }
}

const cleanupTempUploads = (req, res, next) => {
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    Promise.all(collectFiles(req).map(cleanupTempFile)).catch((error) => {
      console.warn(`Temp upload cleanup failed: ${error.message}`)
    })
  }

  res.on('finish', cleanup)
  res.on('close', () => {
    if (!res.writableEnded) setTimeout(cleanup, 60 * 1000).unref()
  })
  next()
}

module.exports = upload
module.exports.imageUpload = imageUpload
module.exports.candidateDocumentUpload = candidateDocumentUpload
module.exports.spreadsheetUpload = spreadsheetUpload
module.exports.cleanupTempUploads = cleanupTempUploads
