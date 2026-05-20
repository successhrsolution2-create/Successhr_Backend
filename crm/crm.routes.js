const express = require('express')
const authRoutes = require('./routes/crm.auth.routes')
const candidateRoutes = require('./routes/crm.candidate.routes')
const crmCandidateController = require('./controllers/crm.candidate.controller')
const { checkCrmRole, verifyCrmToken } = require('./middleware/crm.auth.middleware')
const { validateInput } = require('./middleware/crm.validate.middleware')

const router = express.Router()

router.use('/auth', authRoutes)
router.get(
  '/dashboard/stats',
  verifyCrmToken,
  checkCrmRole(['crm_employee']),
  validateInput,
  crmCandidateController.getDashboardStats
)
router.use('/candidates', candidateRoutes)

module.exports = router
