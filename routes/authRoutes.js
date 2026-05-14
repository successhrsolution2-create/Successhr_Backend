const express = require('express')
const rateLimit = require('express-rate-limit')
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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
})

router.post('/login', loginLimiter, login)
router.get('/me', verifyToken, me)
router.get('/settings', verifyToken, requireRole('superAdmin', 'businessAdvisor', 'candidateAdmin'), getSuperAdminSettings)
router.put('/settings/profile', verifyToken, requireRole('superAdmin', 'businessAdvisor', 'candidateAdmin'), updateSuperAdminProfile)
router.put('/settings/password', verifyToken, requireRole('superAdmin', 'businessAdvisor', 'candidateAdmin'), updateSuperAdminPassword)

module.exports = router
