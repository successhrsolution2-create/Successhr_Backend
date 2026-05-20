const express = require('express')
const rateLimit = require('express-rate-limit')
const crmCandidateController = require('../controllers/crm.candidate.controller')
const { checkCrmRole, verifyCrmToken } = require('../middleware/crm.auth.middleware')
const {
  sanitizeCrmBody,
  validateCrmCallLog,
  validateCrmCandidate,
  validateCrmMongoId,
  validateInput
} = require('../middleware/crm.validate.middleware')

const router = express.Router()

const crmImportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many CRM import requests. Please wait a moment.'
  }
})

router.use(verifyCrmToken)

router.post(
  '/',
  checkCrmRole(['crm_employee']),
  sanitizeCrmBody,
  validateCrmCandidate,
  validateInput,
  crmCandidateController.createCandidate
)

router.post(
  '/import/bulk',
  crmImportLimiter,
  checkCrmRole(['crm_employee']),
  sanitizeCrmBody,
  crmCandidateController.bulkImportCandidates
)

router.post(
  '/import/check',
  crmImportLimiter,
  checkCrmRole(['crm_employee']),
  sanitizeCrmBody,
  crmCandidateController.checkImportCandidates
)

router.get('/', checkCrmRole(['crm_employee']), validateInput, crmCandidateController.listCandidates)

router.delete(
  '/bulk',
  checkCrmRole(['crm_employee', 'crm_super_admin']),
  sanitizeCrmBody,
  crmCandidateController.bulkDeleteCandidates
)

router.post(
  '/:id/logs',
  checkCrmRole(['crm_employee']),
  sanitizeCrmBody,
  validateCrmMongoId('id'),
  validateCrmCallLog,
  validateInput,
  crmCandidateController.addCallLog
)

router.get(
  '/:id/logs',
  checkCrmRole(['crm_employee']),
  validateCrmMongoId('id'),
  validateInput,
  crmCandidateController.getCallLogs
)

router.get(
  '/:id',
  checkCrmRole(['crm_employee']),
  validateCrmMongoId('id'),
  validateInput,
  crmCandidateController.getCandidate
)

router.put(
  '/:id',
  checkCrmRole(['crm_employee']),
  sanitizeCrmBody,
  validateCrmMongoId('id'),
  validateCrmCandidate,
  validateInput,
  crmCandidateController.updateCandidate
)

router.delete(
  '/:id',
  checkCrmRole(['crm_employee', 'crm_super_admin']),
  validateCrmMongoId('id'),
  validateInput,
  crmCandidateController.softDeleteCandidate
)

module.exports = router
