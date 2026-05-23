const toRad = (value) => (Number(value) * Math.PI) / 180

const getDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const latitude1 = Number(lat1)
  const longitude1 = Number(lng1)
  const latitude2 = Number(lat2)
  const longitude2 = Number(lng2)

  if (![latitude1, longitude1, latitude2, longitude2].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY
  }

  const earthRadiusMeters = 6371000
  const dLat = toRad(latitude2 - latitude1)
  const dLng = toRad(longitude2 - longitude1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latitude1)) * Math.cos(toRad(latitude2)) * Math.sin(dLng / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const isInsideGeofence = (employeeLat, employeeLng, officeLat, officeLng, radiusMeters) =>
  getDistanceMeters(employeeLat, employeeLng, officeLat, officeLng) <= Number(radiusMeters || 0)

const normalizeCoordinates = (source = {}) => {
  const latitude = Number(source.latitude ?? source.lat)
  const longitude = Number(source.longitude ?? source.lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { lat: latitude, lng: longitude }
}

module.exports = {
  getDistanceMeters,
  isInsideGeofence,
  normalizeCoordinates
}
