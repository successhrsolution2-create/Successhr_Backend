const express = require('express')

const router = express.Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true, module: 'ems' })
})

router.use('/auth', require('./authRoutes'))
router.use('/employees', require('./employeeRoutes'))
router.use('/departments', require('./departmentRoutes'))
router.use('/locations', require('./locationRoutes'))
router.use('/schedules', require('./scheduleRoutes'))
router.use('/attendance', require('./attendanceRoutes'))
router.use('/leaves', require('./leaveRoutes'))
router.use('/payroll', require('./payrollRoutes'))
router.use('/documents', require('./documentRoutes'))
router.use('/reports', require('./reportRoutes'))

module.exports = router
