const express = require('express')
const {
  createAdmin,
  deleteAdmin,
  listAdmins,
  listInterviewInfo,
  listVacancies,
  resetAdminPassword,
  summary,
  updateAdmin,
  updateInterviewPlacementFeedback,
  assignCandidates
} = require('../controllers/companyAdminController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.use(verifyToken, requireRole('superAdmin'))
router.get('/summary', summary)
router.route('/admins').get(listAdmins).post(createAdmin)
router.route('/admins/:id').put(updateAdmin).delete(deleteAdmin)
router.put('/admins/:id/reset-password', resetAdminPassword)
router.get('/interview-info', listInterviewInfo)
router.post('/interview-info/assign', assignCandidates)
router.get('/vacancies', listVacancies)
router.put('/interview-info/:id/placement-feedback', updateInterviewPlacementFeedback)

module.exports = router
