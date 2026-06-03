const COMPANY_ADMIN_COOKIE_NAME = 'success_hr_company_admin_session'
const COMPANY_ADMIN_SESSION_MARKER = 'cookie'
const COMPANY_ADMIN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const companyAdminCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: COMPANY_ADMIN_COOKIE_MAX_AGE_MS,
  path: '/api/company-admin'
})

const clearCompanyAdminCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/api/company-admin'
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

const tokenFromCompanyAdminRequest = (req) =>
  parseCookies(req.headers.cookie)[COMPANY_ADMIN_COOKIE_NAME] || null

module.exports = {
  COMPANY_ADMIN_COOKIE_NAME,
  COMPANY_ADMIN_SESSION_MARKER,
  companyAdminCookieOptions,
  clearCompanyAdminCookieOptions,
  tokenFromCompanyAdminRequest
}
