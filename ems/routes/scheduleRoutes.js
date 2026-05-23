const express = require('express')

const {
  createSchedule,
  deleteSchedule,
  employeeSchedule,
  listSchedules,
  updateSchedule
} = require('../controllers/scheduleController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.get('/', requireEmsRole('manager'), listSchedules)
router.post('/', requireEmsRole('admin'), createSchedule)
router.put('/:id', requireEmsRole('admin'), updateSchedule)
router.delete('/:id', requireEmsRole('admin'), deleteSchedule)
router.get('/employee/:id', requireEmsRole('employee'), employeeSchedule)

module.exports = router
