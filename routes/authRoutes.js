const express = require('express')
const {
  login,
  me,
  getSuperAdminSettings,
  updateSuperAdminProfile,
  updateSuperAdminPassword
} = require('../controllers/authController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.post('/login', login)
router.get('/me', verifyToken, me)
router.get('/settings', verifyToken, requireRole('superAdmin'), getSuperAdminSettings)
router.put('/settings/profile', verifyToken, requireRole('superAdmin'), updateSuperAdminProfile)
router.put('/settings/password', verifyToken, requireRole('superAdmin'), updateSuperAdminPassword)

module.exports = router
