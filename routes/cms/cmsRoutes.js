const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  createCandidate,
  importCandidates,
  previewImportCandidates,
  confirmImportCandidates,
  createCompany,
  listCandidates,
  listCompanies,
  getCandidateById,
  getCompanyById,
  updateCandidate,
  uploadCandidateDocument,
  deleteCandidateDocument,
  viewCandidateDocument,
  downloadSuccessRemarkPdf,
  createSuccessRemarkShareLink,
  uploadInterviewDocument,
  deleteInterviewDocument,
  viewInterviewDocument,
  updateCompany,
  deleteCandidate,
  bulkDeleteCandidates,
  deleteCompany,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
} = require('../../controllers/cms/cmsController')
const { exportCandidates } = require('../../controllers/cms/cmsExportController')
const upload = require('../../middleware/uploadMiddleware')
const { candidateDocumentUpload } = upload
const { spreadsheetUpload } = upload

const router = express.Router()

const listLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a moment.' }
})

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many imports. Please wait before trying again.' }
})

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many uploads. Please wait before trying again.' }
})

router.route('/candidates').get(listLimiter, listCandidates).post(createCandidate)
router.post('/candidates/import/preview', importLimiter, spreadsheetUpload.single('file'), previewImportCandidates)
router.post('/candidates/import/confirm', importLimiter, confirmImportCandidates)
router.post('/candidates/import', importLimiter, spreadsheetUpload.single('file'), importCandidates)
router.get('/candidates/export', listLimiter, exportCandidates)
router.delete('/candidates/bulk', bulkDeleteCandidates)
router.route('/candidates/:id').get(getCandidateById).put(updateCandidate).delete(deleteCandidate)
router.post('/candidates/:id/documents', uploadLimiter, candidateDocumentUpload.single('document'), uploadCandidateDocument)
router.delete('/candidates/:id/documents/:docId', deleteCandidateDocument)
router.get('/candidates/:id/documents/:docId/view', viewCandidateDocument)
router.get('/candidates/:id/success-remark.pdf', downloadSuccessRemarkPdf)
router.post('/candidates/:id/success-remark-share', createSuccessRemarkShareLink)
router.route('/companies').get(listLimiter, listCompanies).post(createCompany)
router.route('/companies/:id').get(getCompanyById).put(updateCompany).delete(deleteCompany)
router.route('/candidates/:id/interviews').get(listInterviews).post(addInterview)
router.route('/interviews/:interviewId').put(updateInterview).delete(deleteInterview)
router.post('/interviews/:interviewId/documents', uploadLimiter, upload.single('document'), uploadInterviewDocument)
router.delete('/interviews/:interviewId/documents/:docId', deleteInterviewDocument)
router.get('/interviews/:interviewId/documents/:docId/view', viewInterviewDocument)
router.route('/candidates/:id/remarks').get(getRemarks).patch(updateRemarks)

module.exports = router
