const defaultClientUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'

const configuredOrigins = new Set(
  (process.env.CLIENT_URL || defaultClientUrl)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)

const localDevOriginPattern =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/
const allowLocalOrigins =
  process.env.NODE_ENV !== 'production' ||
  String(process.env.ALLOW_LOCAL_CORS || '').toLowerCase() === 'true'

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  return configuredOrigins.has(origin) || (allowLocalOrigins && localDevOriginPattern.test(origin))
}

const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true)
    return
  }

  callback(new Error(`CORS blocked origin: ${origin}`))
}

module.exports = {
  corsOrigin,
  isAllowedOrigin
}
