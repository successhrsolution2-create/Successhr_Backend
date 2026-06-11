const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  createOwnVacancy,
  createOwnInterviewInfo,
  dashboard,
  getOwnInterviewInfo,
  listOwnVacancies,
  login,
  logout,
  me,
  saveOwnInterviewInfo,
  updateOwnInterviewInfo,
  updateOwnVacancy
} = require('../controllers/companyAdminController')
const { verifyCompanyAdminToken } = require('../middleware/companyAdminAuthMiddleware')
const upload = require('../middleware/uploadMiddleware')

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
router
  .route('/interview-info')
  .get(verifyCompanyAdminToken, getOwnInterviewInfo)
  .post(verifyCompanyAdminToken, upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'offerLetter', maxCount: 1 },
    { name: 'appointmentLetter', maxCount: 1 }
  ]), createOwnInterviewInfo)
  .put(verifyCompanyAdminToken, upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'offerLetter', maxCount: 1 },
    { name: 'appointmentLetter', maxCount: 1 }
  ]), saveOwnInterviewInfo)
router.put('/interview-info/:id', verifyCompanyAdminToken, upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 },
  { name: 'appointmentLetter', maxCount: 1 }
]), updateOwnInterviewInfo)
router.route('/vacancies')
  .get(verifyCompanyAdminToken, listOwnVacancies)
  .post(verifyCompanyAdminToken, createOwnVacancy)
router.put('/vacancies/:id', verifyCompanyAdminToken, updateOwnVacancy)

module.exports = router
