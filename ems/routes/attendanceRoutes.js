const express = require('express')

const {
  allAttendance,
  checkIn,
  checkOut,
  currentStatus,
  employeeAttendance,
  overrideAttendance,
  report,
  today,
  todayForEmployee
} = require('../controllers/attendanceController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.post('/check-in', requireEmsRole('attendance'), checkIn)
router.post('/check-out', requireEmsRole('attendance'), checkOut)
router.get('/today', requireEmsRole('manager'), today)
router.get('/today/:employeeId', requireEmsRole('attendance'), todayForEmployee)
router.get('/status/:employeeId', requireEmsRole('attendance'), currentStatus)
router.get('/all', requireEmsRole('manager'), allAttendance)
router.get('/employee/:id', requireEmsRole('attendance'), employeeAttendance)
router.get('/report', requireEmsRole('manager'), report)
router.put('/:id/override', requireEmsRole('hr'), overrideAttendance)

module.exports = router
