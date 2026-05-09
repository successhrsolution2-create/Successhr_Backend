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
const { cache } = require('../src/middleware/cache')

const router = express.Router()

router.use(verifyToken)

router.get('/my', requireRole('businessAdvisor'), cache(300), getMyPlacements)
router.get('/summary', requireRole('superAdmin', 'candidateAdmin'), cache(600), getCommissionSummary)
router.get('/ba/:baId/summary', requireRole('superAdmin', 'candidateAdmin'), cache(600), getBaCommissionSummary)

router
  .route('/')
  .post(requireRole('superAdmin', 'candidateAdmin'), createPlacement)
  .get(requireRole('superAdmin', 'candidateAdmin'), cache(300), getPlacements)

router
  .route('/:id')
  .get(cache(120), getPlacementById)
  .put(requireRole('superAdmin', 'candidateAdmin'), updatePlacement)

router.patch('/:id/pay', requireRole('superAdmin', 'candidateAdmin'), markPlacementPaid)

module.exports = router
