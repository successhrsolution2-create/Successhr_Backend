const express = require('express')
const {
  listBusinessAdvisors,
  createBusinessAdvisor,
  updateBusinessAdvisorUser,
  resetBusinessAdvisorPassword,
  deleteBusinessAdvisorUser,
  listManagers,
  createManager,
  updateManager,
  resetManagerPassword,
  deleteManager,
  listAdminUsers,
  updateCandidateAdmin,
  deleteCandidateAdmin
} = require('../controllers/userController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.use(verifyToken, requireRole('superAdmin'))

router.route('/managers').get(listManagers).post(createManager)
router.route('/managers/:id').put(updateManager).delete(deleteManager)
router.put('/managers/:id/reset-password', resetManagerPassword)

router.get('/all', listAdminUsers)

router.route('/').get(listBusinessAdvisors).post(createBusinessAdvisor)
router.route('/:id').put(updateBusinessAdvisorUser).delete(deleteBusinessAdvisorUser)
router.put('/:id/reset-password', resetBusinessAdvisorPassword)

router.route('/candidate-admins/:id').put(updateCandidateAdmin).delete(deleteCandidateAdmin)

module.exports = router
