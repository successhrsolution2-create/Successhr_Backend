const express = require('express')
const {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  uploadStudentDocuments,
  updateStudentStatus,
  reorderStudents
} = require('../controllers/studentController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')
const upload = require('../middleware/uploadMiddleware')

const router = express.Router()

router.use(verifyToken)

router.route('/').get(getStudents).post(requireRole('businessAdvisor'), createStudent)
router.patch('/reorder', requireRole('superAdmin'), reorderStudents)
router.post('/:id/docs', requireRole('businessAdvisor', 'superAdmin'), upload.array('documents', 10), uploadStudentDocuments)
router.patch('/:id/status', requireRole('superAdmin'), updateStudentStatus)
router
  .route('/:id')
  .get(getStudentById)
  .put(updateStudent)
  .delete(requireRole('superAdmin'), deleteStudent)

module.exports = router
