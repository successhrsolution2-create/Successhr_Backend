const express = require('express')

const {
  applyLeave,
  approveLeave,
  leaveBalance,
  listLeaves,
  pendingLeaves,
  rejectLeave
} = require('../controllers/leaveController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.post('/apply', requireEmsRole('employee'), applyLeave)
router.get('/', requireEmsRole('employee'), listLeaves)
router.get('/pending', requireEmsRole('manager'), pendingLeaves)
router.put('/:id/approve', requireEmsRole('manager'), approveLeave)
router.put('/:id/reject', requireEmsRole('manager'), rejectLeave)
router.get('/balance/:employeeId', requireEmsRole('employee'), leaveBalance)

module.exports = router
