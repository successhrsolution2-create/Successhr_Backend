const express = require('express')
const {
  getCandidates,
  createCandidate,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
  uploadCandidateDocuments,
  deleteCandidateDocument,
  updateCandidateStatus,
  reorderCandidates
} = require('../controllers/candidateController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')
const upload = require('../middleware/uploadMiddleware')
const { cache } = require('../src/middleware/cache')

const router = express.Router()

router.use(verifyToken)

router.route('/').get(cache(300), getCandidates).post(requireRole('businessAdvisor'), createCandidate)
router.patch('/reorder', requireRole('superAdmin'), reorderCandidates)
router.post('/:id/docs', requireRole('businessAdvisor', 'superAdmin'), upload.array('documents', 10), uploadCandidateDocuments)
router.delete('/:id/docs/:docId', requireRole('superAdmin'), deleteCandidateDocument)
router.patch('/:id/status', requireRole('superAdmin'), updateCandidateStatus)
router
  .route('/:id')
  .get(cache(120), getCandidateById)
  .put(updateCandidate)
  .delete(requireRole('superAdmin'), deleteCandidate)

module.exports = router
