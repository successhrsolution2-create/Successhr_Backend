const defaultClientUrls =
  process.env.NODE_ENV === 'production'
    ? ['https://app.successhrsolutions.com', 'https://apply.successhrsolutions.com']
    : ['http://localhost:5173']

const normalizeOrigin = (origin) => {
  if (!origin) return ''

  try {
    return new URL(origin).origin
  } catch (_error) {
    return String(origin).trim().replace(/\/+$/, '')
  }
}

const configuredOrigins = new Set(
  [...defaultClientUrls, ...(process.env.CLIENT_URL || '').split(',')]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
)

const allowedOriginSuffixes = (process.env.CLIENT_DOMAIN_SUFFIXES || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)

const localDevOriginPattern =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/
const allowLocalOrigins =
  process.env.NODE_ENV !== 'production' ||
  String(process.env.ALLOW_LOCAL_CORS || '').toLowerCase() === 'true'

const isAllowedOrigin = (origin) => {
  if (!origin) return true

  const normalizedOrigin = normalizeOrigin(origin)
  const hostname = (() => {
    try {
      return new URL(normalizedOrigin).hostname.toLowerCase()
    } catch (_error) {
      return ''
    }
  })()

  return (
    configuredOrigins.has(normalizedOrigin) ||
    allowedOriginSuffixes.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) ||
    (allowLocalOrigins && localDevOriginPattern.test(normalizedOrigin))
  )
}

const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true)
    return
  }

  const error = new Error('CORS origin is not allowed')
  error.statusCode = 403
  error.publicMessage = 'CORS origin is not allowed'
  callback(error)
}

module.exports = {
  corsOrigin,
  isAllowedOrigin
}
