const express = require('express')
const rateLimit = require('express-rate-limit')
const crmAuthController = require('../controllers/crm.auth.controller')
const {
  sanitizeCrmBody,
  validateCrmLogin,
  validateInput
} = require('../middleware/crm.validate.middleware')

const router = express.Router()

const crmLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many CRM login attempts. Please try again after 15 minutes.'
  }
})

router.post('/login', crmLoginLimiter, sanitizeCrmBody, validateCrmLogin, validateInput, crmAuthController.login)
router.post('/logout', crmAuthController.logout)
router.post('/refresh', crmAuthController.refresh)

module.exports = router
