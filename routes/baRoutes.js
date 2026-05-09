const express = require('express')
const {
  getOwnProfile,
  getProfileByUserId,
  updateOwnProfile,
  updateProfileByUserId,
  uploadProfileDocument,
  uploadProfileDocumentByUserId,
  listAllProfiles,
  getPublicFormCountByUserId
} = require('../controllers/baController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')
const upload = require('../middleware/uploadMiddleware')
const { cache } = require('../src/middleware/cache')

const router = express.Router()

router.get('/all', verifyToken, requireRole('superAdmin', 'candidateAdmin'), cache(300), listAllProfiles)
router.get('/profile', verifyToken, requireRole('businessAdvisor'), cache(120), getOwnProfile)
router.get('/profile/:userId', verifyToken, requireRole('superAdmin'), cache(120), getProfileByUserId)
router.get('/:userId/public-form-count', verifyToken, requireRole('superAdmin'), cache(600), getPublicFormCountByUserId)
router.put('/profile/:userId', verifyToken, requireRole('superAdmin'), updateProfileByUserId)
router.put('/profile', verifyToken, requireRole('businessAdvisor'), updateOwnProfile)
router.post(
  '/profile/:userId/upload',
  verifyToken,
  requireRole('superAdmin'),
  upload.single('file'),
  uploadProfileDocumentByUserId
)
router.post(
  '/profile/upload',
  verifyToken,
  requireRole('businessAdvisor'),
  upload.single('file'),
  uploadProfileDocument
)

module.exports = router
