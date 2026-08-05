const express = require('express')

const { dashboardSummary } = require('../controllers/superAdminDashboardController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const { getCandidateChartData } = require('../controllers/superAdminChartController')

const router = express.Router()

router.get('/dashboard-summary', verifyToken, requireRole('superAdmin'), dashboardSummary)
router.get('/candidate-chart-data', verifyToken, requireRole('superAdmin'), getCandidateChartData)

module.exports = router
