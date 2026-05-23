const express = require('express')

const {
  attendanceSummary,
  dashboard,
  headcount,
  leaveSummary,
  payrollSummary
} = require('../controllers/reportController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth, requireEmsRole('manager'))
router.get('/dashboard', dashboard)
router.get('/headcount', headcount)
router.get('/attendance-summary', attendanceSummary)
router.get('/leave-summary', leaveSummary)
router.get('/payroll-summary', payrollSummary)

module.exports = router
