const express = require('express')
const {
  createPlacement,
  getPlacements,
  getMyPlacements,
  getPlacementById,
  updatePlacement,
  markPlacementPaid,
  getCommissionSummary,
  getBaCommissionSummary
} = require('../controllers/placementController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.use(verifyToken)

router.get('/my', requireRole('businessAdvisor'), getMyPlacements)
router.get('/summary', requireRole('superAdmin', 'candidateAdmin'), getCommissionSummary)
router.get('/ba/:baId/summary', requireRole('superAdmin', 'candidateAdmin'), getBaCommissionSummary)

router
  .route('/')
  .post(requireRole('superAdmin', 'candidateAdmin'), createPlacement)
  .get(requireRole('superAdmin', 'candidateAdmin'), getPlacements)

router
  .route('/:id')
  .get(getPlacementById)
  .put(requireRole('superAdmin', 'candidateAdmin'), updatePlacement)

router.patch('/:id/pay', requireRole('superAdmin', 'candidateAdmin'), markPlacementPaid)

module.exports = router
