const express = require('express')
const {
  listBusinessAdvisors,
  createBusinessAdvisor,
  updateBusinessAdvisorUser,
  resetBusinessAdvisorPassword,
  deleteBusinessAdvisorUser
} = require('../controllers/userController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.use(verifyToken, requireRole('superAdmin'))

router.route('/').get(listBusinessAdvisors).post(createBusinessAdvisor)
router.route('/:id').put(updateBusinessAdvisorUser).delete(deleteBusinessAdvisorUser)
router.put('/:id/reset-password', resetBusinessAdvisorPassword)

module.exports = router
