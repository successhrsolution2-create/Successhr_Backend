const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const {
  deleteDocument,
  downloadDocument,
  employeeDocuments,
  uploadDocument
} = require('../controllers/documentController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()
const uploadRoot = path.resolve(process.cwd(), process.env.EMS_UPLOAD_PATH || './ems/uploads')
fs.mkdirSync(uploadRoot, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true)
    return cb(new Error('EMS documents must be PDF, JPG, or PNG files'))
  }
})

router.use(emsAuth)
router.post('/upload', requireEmsRole('employee'), upload.single('file'), uploadDocument)
router.get('/employee/:id', requireEmsRole('employee'), employeeDocuments)
router.get('/file/:filename', requireEmsRole('employee'), downloadDocument)
router.delete('/:id', requireEmsRole('hr'), deleteDocument)

module.exports = router
