const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  getAdvisorByCode,
  submitApplication,
  loginCandidateApplication,
  getCandidateApplicationSession,
  updateCandidateApplication,
  downloadSharedSuccessRemarkPdf
} = require('../controllers/publicController')
const { cache } = require('../src/middleware/cache')
const { candidateDocumentUpload } = require('../middleware/uploadMiddleware')
const { candidateDocumentUploadFields } = require('../utils/candidateDocuments')

const router = express.Router()

const codeLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: 'Too many requests. Please wait a moment.' }
})

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  skipFailedRequests: true,
  message: { message: 'Too many submissions from this connection.' }
})

const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Too many PDF requests. Please wait a moment.' }
})

router.get('/advisor/:code', codeLookupLimiter, cache(120), getAdvisorByCode)
router.post('/candidate/login', codeLookupLimiter, loginCandidateApplication)
router.get('/candidate/me', codeLookupLimiter, getCandidateApplicationSession)
router.put('/candidate/apply', submitLimiter, candidateDocumentUpload.fields(candidateDocumentUploadFields), updateCandidateApplication)
router.get('/sr/:code.pdf', pdfLimiter, downloadSharedSuccessRemarkPdf)
router.get('/candidates/success-remark/:token.pdf', pdfLimiter, downloadSharedSuccessRemarkPdf)
router.post('/apply', submitLimiter, candidateDocumentUpload.fields(candidateDocumentUploadFields), submitApplication)
router.post('/apply/:code', submitLimiter, candidateDocumentUpload.fields(candidateDocumentUploadFields), submitApplication)

module.exports = router
