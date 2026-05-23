const OfficeLocation = require('../models/OfficeLocation')
const WorkSchedule = require('../models/WorkSchedule')
const { getDistanceMeters, normalizeCoordinates } = require('../utils/emsGeoUtils')
const { buildSearch, pagination, pick, safeText } = require('../utils/emsHelpers')

const locationFields = ['name', 'address', 'coordinates', 'radius', 'isActive']

const normalizeLocationPayload = (body = {}) => {
  const payload = pick(body, locationFields)
  const coordinates = body.coordinates || body
  payload.name = safeText(payload.name)
  payload.address = safeText(payload.address)
  payload.coordinates = {
    latitude: Number(coordinates.latitude ?? coordinates.lat),
    longitude: Number(coordinates.longitude ?? coordinates.lng)
  }
  payload.radius = Number(payload.radius || 100)
  return payload
}

const listLocations = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = buildSearch(req.query.search, ['name', 'address'])
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true'

  const [items, total] = await Promise.all([
    OfficeLocation.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    OfficeLocation.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const createLocation = async (req, res) => {
  const payload = normalizeLocationPayload(req.body)
  payload.createdBy = req.emsUser?.id || null
  const location = await OfficeLocation.create(payload)
  res.status(201).json({ message: 'Office location created', location })
}

const updateLocation = async (req, res) => {
  const payload = normalizeLocationPayload(req.body)
  payload.updatedBy = req.emsUser?.id || null
  const location = await OfficeLocation.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true
  })

  if (!location) {
    return res.status(404).json({ message: 'Office location not found' })
  }

  res.json({ message: 'Office location updated', location })
}

const deleteLocation = async (req, res) => {
  const assignedSchedules = await WorkSchedule.countDocuments({ officeLocation: req.params.id, isActive: true })
  if (assignedSchedules > 0) {
    return res.status(409).json({ message: 'Cannot delete a location assigned to active schedules' })
  }

  const location = await OfficeLocation.findByIdAndDelete(req.params.id)
  if (!location) {
    return res.status(404).json({ message: 'Office location not found' })
  }

  res.json({ message: 'Office location deleted' })
}

const validateLocation = async (req, res) => {
  const location = await OfficeLocation.findById(req.params.id).lean()
  if (!location) {
    return res.status(404).json({ message: 'Office location not found' })
  }

  const coordinates = normalizeCoordinates(req.query)
  if (!coordinates) {
    return res.status(400).json({ message: 'lat and lng query params are required' })
  }

  const distance = getDistanceMeters(
    coordinates.lat,
    coordinates.lng,
    location.coordinates.latitude,
    location.coordinates.longitude
  )

  res.json({
    inside: distance <= Number(location.radius || 0),
    distance,
    radius: location.radius,
    location
  })
}

module.exports = {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
  validateLocation
}
