const multer = require('multer')

const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']

const fileFilter = (_req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
    return
  }

  cb(new Error('Only JPG, PNG, and PDF files are allowed'))
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
})

module.exports = upload
