const jwt = require('jsonwebtoken')
const CrmUser = require('../models/CrmUser.model')

const CRM_ROLES = ['crm_super_admin', 'crm_employee']

const getCrmJwtSecret = () => {
  const secret = process.env.CRM_JWT_SECRET

  if (!secret) {
    const error = new Error('CRM_JWT_SECRET is not configured')
    error.statusCode = 500
    throw error
  }

  return secret
}

const getBearerToken = (req) => {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

const verifyCrmToken = async (req, res, next) => {
  const token = getBearerToken(req)

  if (!token) {
    // FALLBACK: Check if there's a valid CMS admin token in cookies
    const { tokenFromRequest } = require('../../utils/authCookie')
    const cmsToken = tokenFromRequest(req)
    if (cmsToken) {
      try {
        const decodedCms = jwt.verify(cmsToken, process.env.JWT_SECRET, { algorithms: ['HS256'] })
        
        // We need to fetch the CMS user to get their actual role because the token only contains { id, tokenVersion }
        const mongoose = require('mongoose')
        const CmsUser = mongoose.model('User')
        const cmsUser = await CmsUser.findById(decodedCms.id)
        
        if (cmsUser) {
          if (['superAdmin', 'candidateAdmin'].includes(cmsUser.role)) {
            const adminUser = await CrmUser.findOne({ role: 'crm_super_admin' })
            if (adminUser) {
              req.crmUser = {
                id: adminUser._id.toString(),
                _id: adminUser._id,
                name: 'CMS Admin',
                email: adminUser.email,
                role: 'crm_super_admin'
              }
              return next()
            }
          } else if (cmsUser.role === 'manager') {
            req.crmUser = {
              id: cmsUser._id.toString(),
              _id: cmsUser._id,
              name: cmsUser.name || 'Manager',
              email: cmsUser.email || '',
              role: 'crm_super_admin' // Allowed to bypass route guards
            }
            return next()
          }
        }
      } catch (err) {
        // Ignore and fall through to standard 401
      }
    }

    return res.status(401).json({
      success: false,
      message: 'CRM authorization token is required'
    })
  }

  try {
    const decoded = jwt.verify(token, getCrmJwtSecret(), { algorithms: ['HS256'] })

    if (decoded.type !== 'access' || !CRM_ROLES.includes(decoded.role)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid CRM authorization token'
      })
    }

    const user = await CrmUser.findById(decoded.sub).select('_id name email role isActive tokenVersion')

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'CRM account is inactive or no longer exists'
      })
    }

    if (Number(decoded.tokenVersion ?? -1) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'CRM authorization token has been revoked'
      })
    }

    req.crmUser = {
      id: user._id.toString(),
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }

    return next()
  } catch (error) {
    if (error.statusCode === 500) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired CRM authorization token'
    })
  }
}

const checkCrmRole = (allowedRoles = []) => {
  const normalizedRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  return (req, res, next) => {
    if (!req.crmUser) {
      return res.status(401).json({
        success: false,
        message: 'CRM authentication is required'
      })
    }

    // Let crm_super_admin bypass role checks
    if (req.crmUser.role === 'crm_super_admin') {
      return next()
    }

    if (!normalizedRoles.includes(req.crmUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this CRM resource'
      })
    }

    return next()
  }
}

module.exports = {
  CRM_ROLES,
  checkCrmRole,
  getCrmJwtSecret,
  verifyCrmToken
}
