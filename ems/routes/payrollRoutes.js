const express = require('express')

const {
  employeePayroll,
  generatePayroll,
  listPayroll,
  payslip,
  releasePayroll
} = require('../controllers/payrollController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.post('/generate', requireEmsRole('hr'), generatePayroll)
router.get('/', requireEmsRole('hr'), listPayroll)
router.get('/employee/:id', requireEmsRole('employee'), employeePayroll)
router.put('/:id/release', requireEmsRole('hr'), releasePayroll)
router.get('/:id/payslip', requireEmsRole('employee'), payslip)

module.exports = router
