const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  dashboard,
  getOwnInterviewInfo,
  login,
  logout,
  me,
  saveOwnInterviewInfo
} = require('../controllers/companyAdminController')
const { verifyCompanyAdminToken } = require('../middleware/companyAdminAuthMiddleware')

const router = express.Router()

const companyAdminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many company admin login attempts. Please try again later.' }
})

router.post('/auth/login', companyAdminLoginLimiter, login)
router.post('/auth/logout', logout)
router.get('/auth/me', verifyCompanyAdminToken, me)
router.get('/dashboard', verifyCompanyAdminToken, dashboard)
router.route('/interview-info').get(verifyCompanyAdminToken, getOwnInterviewInfo).put(verifyCompanyAdminToken, saveOwnInterviewInfo)

module.exports = router
