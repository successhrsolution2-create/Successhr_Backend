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
const { cache } = require('../src/middleware/cache')

const router = express.Router()

router.use(verifyToken)

router.route('/').get(cache(300), getCompanies).post(requireRole('businessAdvisor'), createCompany)
router.patch('/reorder', requireRole('superAdmin'), reorderCompanies)
router.patch('/:id/status', requireRole('superAdmin'), updateCompanyStatus)
router
  .route('/:id')
  .get(cache(120), getCompanyById)
  .put(updateCompany)
  .delete(requireRole('superAdmin'), deleteCompany)

module.exports = router
