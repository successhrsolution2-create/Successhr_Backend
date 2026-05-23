const express = require('express')

const {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment
} = require('../controllers/departmentController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.get('/', requireEmsRole('manager'), listDepartments)
router.post('/', requireEmsRole('hr'), createDepartment)
router.put('/:id', requireEmsRole('hr'), updateDepartment)
router.delete('/:id', requireEmsRole('admin'), deleteDepartment)

module.exports = router
