const AUTH_COOKIE_NAME = 'success_hr_session'
const SESSION_MARKER = 'cookie'
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const authCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
  path: '/'
})

const clearAuthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/'
})

const parseCookies = (cookieHeader = '') =>
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return cookies

      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1)
      if (!key) return cookies

      try {
        cookies[key] = decodeURIComponent(value)
      } catch (_error) {
        cookies[key] = value
      }
      return cookies
    }, {})

const tokenFromAuthHeader = (authHeader) =>
  typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null

const tokenFromRequest = (req) => {
  const bearerToken = tokenFromAuthHeader(req.headers.authorization)
  if (bearerToken && bearerToken !== SESSION_MARKER) return bearerToken

  return parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME] || null
}

const tokenFromSocket = (socket) => {
  const cookieToken = parseCookies(socket.handshake.headers?.cookie)[AUTH_COOKIE_NAME]
  if (cookieToken) return cookieToken

  const authToken = socket.handshake.auth?.token
  return authToken && authToken !== SESSION_MARKER ? authToken : null
}

module.exports = {
  AUTH_COOKIE_NAME,
  SESSION_MARKER,
  authCookieOptions,
  clearAuthCookieOptions,
  tokenFromRequest,
  tokenFromSocket
}
