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
router.get('/summary', requireRole('superAdmin'), getCommissionSummary)
router.get('/ba/:baId/summary', requireRole('superAdmin'), getBaCommissionSummary)

router
  .route('/')
  .post(requireRole('superAdmin'), createPlacement)
  .get(requireRole('superAdmin'), getPlacements)

router
  .route('/:id')
  .get(getPlacementById)
  .put(requireRole('superAdmin'), updatePlacement)

router.patch('/:id/pay', requireRole('superAdmin'), markPlacementPaid)

module.exports = router
