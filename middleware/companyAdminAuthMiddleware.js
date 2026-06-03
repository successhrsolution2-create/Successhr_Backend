const jwt = require('jsonwebtoken')
const CompanyAdmin = require('../models/companyManagement/CompanyAdmin')
const { tokenFromCompanyAdminRequest } = require('../utils/companyAdminAuthCookie')

const companyAdminJwtSecret = () => process.env.COMPANY_ADMIN_JWT_SECRET || process.env.JWT_SECRET

const verifyCompanyAdminToken = async (req, res, next) => {
  const token = tokenFromCompanyAdminRequest(req)

  if (!token) {
    return res.status(401).json({ message: 'Company admin authentication token missing' })
  }

  try {
    const decoded = jwt.verify(token, companyAdminJwtSecret(), { algorithms: ['HS256'] })
    if (decoded.type !== 'company_admin') {
      return res.status(401).json({ message: 'Invalid or expired company admin token' })
    }

    const companyAdmin = await CompanyAdmin.findById(decoded.id)
    if (!companyAdmin || !companyAdmin.isActive) {
      return res.status(401).json({ message: 'Company admin is inactive or no longer exists' })
    }

    if (Number(decoded.tokenVersion ?? -1) !== Number(companyAdmin.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Company admin token has been revoked' })
    }

    req.companyAdmin = companyAdmin
    return next()
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired company admin token' })
  }
}

module.exports = { verifyCompanyAdminToken }
