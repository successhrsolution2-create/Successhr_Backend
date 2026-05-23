const express = require('express')

const {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
  validateLocation
} = require('../controllers/locationController')
const { emsAuth } = require('../middleware/emsAuth')
const { requireEmsRole } = require('../middleware/emsRBAC')

const router = express.Router()

router.use(emsAuth)
router.get('/', requireEmsRole('manager'), listLocations)
router.post('/', requireEmsRole('admin'), createLocation)
router.put('/:id', requireEmsRole('admin'), updateLocation)
router.delete('/:id', requireEmsRole('admin'), deleteLocation)
router.get('/:id/validate', requireEmsRole('employee'), validateLocation)

module.exports = router
