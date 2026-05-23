const express = require('express')

const { dashboardSummary } = require('../controllers/superAdminDashboardController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.get('/dashboard-summary', verifyToken, requireRole('superAdmin'), dashboardSummary)

module.exports = router
