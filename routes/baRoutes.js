const express = require('express')
const {
  getOwnProfile,
  getProfileByUserId,
  updateOwnProfile,
  updateProfileByUserId,
  uploadProfileDocument,
  uploadProfileDocumentByUserId,
  listAllProfiles
} = require('../controllers/baController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')
const upload = require('../middleware/uploadMiddleware')

const router = express.Router()

router.get('/all', verifyToken, requireRole('superAdmin'), listAllProfiles)
router.get('/profile', verifyToken, requireRole('businessAdvisor'), getOwnProfile)
router.get('/profile/:userId', verifyToken, requireRole('superAdmin'), getProfileByUserId)
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
