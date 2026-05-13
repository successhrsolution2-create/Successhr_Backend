const express = require('express')
const {
  createCandidate,
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
  deleteCompany,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
} = require('../../controllers/cms/cmsController')
const upload = require('../../middleware/uploadMiddleware')
const { candidateDocumentUpload } = upload

const router = express.Router()

router.route('/candidates').get(listCandidates).post(createCandidate)
router.route('/candidates/:id').get(getCandidateById).put(updateCandidate).delete(deleteCandidate)
router.post('/candidates/:id/documents', candidateDocumentUpload.single('document'), uploadCandidateDocument)
router.delete('/candidates/:id/documents/:docId', deleteCandidateDocument)
router.get('/candidates/:id/documents/:docId/view', viewCandidateDocument)
router.get('/candidates/:id/success-remark.pdf', downloadSuccessRemarkPdf)
router.post('/candidates/:id/success-remark-share', createSuccessRemarkShareLink)
router.route('/companies').get(listCompanies).post(createCompany)
router.route('/companies/:id').get(getCompanyById).put(updateCompany).delete(deleteCompany)
router.route('/candidates/:id/interviews').get(listInterviews).post(addInterview)
router.route('/interviews/:interviewId').put(updateInterview).delete(deleteInterview)
router.post('/interviews/:interviewId/documents', upload.single('document'), uploadInterviewDocument)
router.delete('/interviews/:interviewId/documents/:docId', deleteInterviewDocument)
router.get('/interviews/:interviewId/documents/:docId/view', viewInterviewDocument)
router.route('/candidates/:id/remarks').get(getRemarks).patch(updateRemarks)

module.exports = router
