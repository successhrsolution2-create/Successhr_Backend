const express = require('express')
const multer = require('multer')

const {
  bulkImportEmployees,
  createEmployee,
  deleteEmployee,
  exportEmployees,
  getEmployee,
  listEmployees,
  updateEmployee
} = require('../controllers/employeeController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

router.use(emsAuth)
router.get('/', requireEmsRole('manager'), listEmployees)
router.post('/', requireEmsRole('hr'), createEmployee)
router.post('/bulk-import', requireEmsRole('hr'), upload.single('file'), bulkImportEmployees)
router.get('/export', requireEmsRole('hr'), exportEmployees)
router.get('/:id', requireEmsRole('employee'), getEmployee)
router.put('/:id', requireEmsRole('hr'), updateEmployee)
router.delete('/:id', requireEmsRole('hr'), deleteEmployee)

module.exports = router
