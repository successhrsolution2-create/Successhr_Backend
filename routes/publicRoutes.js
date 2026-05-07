const express = require('express')
const rateLimit = require('express-rate-limit')
const upload = require('../middleware/uploadMiddleware')
const { getAdvisorByCode, submitApplication } = require('../controllers/publicController')

const router = express.Router()

const codeLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: 'Too many requests. Please wait a moment.' }
})

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many submissions from this connection.' }
})

router.get('/advisor/:code', codeLookupLimiter, getAdvisorByCode)
router.post('/apply/:code', submitLimiter, upload.array('documents', 10), submitApplication)

module.exports = router
