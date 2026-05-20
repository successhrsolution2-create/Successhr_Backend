const express = require('express')
const crmAdminController = require('../controllers/crm.admin.controller')
const {
  sanitizeCrmBody,
  validateCreateCrmEmployee,
  validateCrmMongoId,
  validateInput,
  validateUpdateCrmEmployee
} = require('../middleware/crm.validate.middleware')

const router = express.Router()

router.post(
  '/employees',
  sanitizeCrmBody,
  validateCreateCrmEmployee,
  validateInput,
  crmAdminController.createEmployee
)

router.get('/employees', crmAdminController.listEmployees)

router.put(
  '/employees/:id',
  sanitizeCrmBody,
  validateCrmMongoId('id'),
  validateUpdateCrmEmployee,
  validateInput,
  crmAdminController.updateEmployee
)

router.patch(
  '/employees/:id/toggle',
  sanitizeCrmBody,
  validateCrmMongoId('id'),
  validateInput,
  crmAdminController.toggleEmployee
)

router.get('/candidates', crmAdminController.listCandidates)
router.get('/reports', crmAdminController.getReports)
router.get('/export', crmAdminController.exportCandidates)

module.exports = router
