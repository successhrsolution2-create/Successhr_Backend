const express = require('express')
const {
  getCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  updateCompanyStatus,
  reorderCompanies
} = require('../controllers/companyController')
const { verifyToken } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleMiddleware')

const router = express.Router()

router.use(verifyToken)

router.route('/').get(getCompanies).post(requireRole('businessAdvisor'), createCompany)
router.patch('/reorder', requireRole('superAdmin'), reorderCompanies)
router.patch('/:id/status', requireRole('superAdmin'), updateCompanyStatus)
router
  .route('/:id')
  .get(getCompanyById)
  .put(updateCompany)
  .delete(requireRole('superAdmin'), deleteCompany)

module.exports = router
