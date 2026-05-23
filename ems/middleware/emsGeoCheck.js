const { getDistanceMeters, normalizeCoordinates } = require('../utils/emsGeoUtils')

const requireCoordinates = (req, res, next) => {
  const coordinates = normalizeCoordinates(req.body)
  if (!coordinates) {
    return res.status(400).json({ message: 'Latitude and longitude are required' })
  }

  req.emsCoordinates = coordinates
  return next()
}

const assertInsideGeofence = ({ coordinates, officeLocation }) => {
  if (!coordinates || !officeLocation?.coordinates) {
    return { inside: false, distance: Number.POSITIVE_INFINITY }
  }

  const distance = getDistanceMeters(
    coordinates.lat,
    coordinates.lng,
    officeLocation.coordinates.latitude,
    officeLocation.coordinates.longitude
  )

  return {
    inside: distance <= Number(officeLocation.radius || 0),
    distance
  }
}

module.exports = {
  assertInsideGeofence,
  requireCoordinates
}
