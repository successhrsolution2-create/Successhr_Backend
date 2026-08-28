const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72
const MOBILE_PATTERN = /^[0-9]{10}$/
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

const CANDIDATE_CLASSES = ['1st', '2nd', '3rd']
const CALL_LOG_STATUSES = ['answered', 'not_answered', 'busy', 'callback']
const CALL_STATUSES = ['pending', 'called', 'followup', 'sure', 'rejected']
const INTERESTED_STATUSES = ['yes', 'no']
const REGISTRATION_INFO = ['RC', 'WRC', 'RC data', 'WRC data', 'College contacts']

const addValidationError = (req, field, message) => {
  req.crmValidationErrors = req.crmValidationErrors || []
  req.crmValidationErrors.push({ field, message })
}

const sanitizeString = (value) => String(value).trim()

const sanitizeObject = (value, skipKeys = new Set()) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item, skipKeys))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (BLOCKED_OBJECT_KEYS.has(key)) return acc
      acc[key] = skipKeys.has(key) ? item : sanitizeObject(item, skipKeys)
      return acc
    }, {})
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  return value
}

const validateInput = (req, res, next) => {
  const errors = req.crmValidationErrors || []

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    })
  }

  return next()
}

const sanitizeCrmBody = (req, _res, next) => {
  req.body = sanitizeObject(req.body || {}, new Set(['password', 'confirmPassword']))
  next()
}

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const normalizeRequiredText = (req, field, label, options = {}) => {
  const min = options.min || 1
  const max = options.max || 255
  const value = typeof req.body?.[field] === 'string' ? req.body[field].trim() : ''

  if (!value) {
    addValidationError(req, field, `${label} is required`)
  } else if (value.length < min) {
    addValidationError(req, field, `${label} must be at least ${min} characters`)
  } else if (value.length > max) {
    addValidationError(req, field, `${label} cannot exceed ${max} characters`)
  }

  req.body[field] = value
  return value
}

const normalizeOptionalText = (req, field, label, options = {}) => {
  const max = options.max || 255
  const value = typeof req.body?.[field] === 'string' ? req.body[field].trim() : ''

  if (value && value.length > max) {
    addValidationError(req, field, `${label} cannot exceed ${max} characters`)
  }

  if (value) {
    req.body[field] = value
  } else {
    delete req.body[field]
  }

  return value
}

const normalizeRequiredEnum = (req, field, label, allowedValues, options = {}) => {
  const caseSensitive = options.caseSensitive !== false
  const rawValue = typeof req.body?.[field] === 'string' ? req.body[field].trim() : ''
  const value = caseSensitive ? rawValue : rawValue.toLowerCase()

  if (!value) {
    addValidationError(req, field, `${label} is required`)
  } else if (!allowedValues.includes(value)) {
    addValidationError(req, field, `${label} must be one of: ${allowedValues.join(', ')}`)
  }

  req.body[field] = value
  return value
}

const validatePassword = (req, field = 'password', options = {}) => {
  const required = options.required !== false
  const password = typeof req.body?.[field] === 'string' ? req.body[field] : ''

  if (!password) {
    if (required) {
      addValidationError(req, field, 'Password is required')
    }
    return password
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    addValidationError(req, field, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    addValidationError(req, field, `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
  }

  return password
}

const validatePasswordConfirmation = (req, options = {}) => {
  const required = options.required !== false
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : ''

  if (!password) return

  if (!confirmPassword) {
    if (required) {
      addValidationError(req, 'confirmPassword', 'Confirm password is required')
    }
    return
  }

  if (password !== confirmPassword) {
    addValidationError(req, 'confirmPassword', 'Passwords do not match')
  }
}

const validateCrmLogin = (req, _res, next) => {
  const body = req.body || {}
  const loginId = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!loginId) {
    addValidationError(req, 'email', 'Email or employee ID is required')
  } else if (loginId.includes('@') && !EMAIL_PATTERN.test(loginId.toLowerCase())) {
    addValidationError(req, 'email', 'Please provide a valid email')
  }

  if (!password) {
    addValidationError(req, 'password', 'Password is required')
  }

  req.body.email = loginId.includes('@') ? loginId.toLowerCase() : loginId.toUpperCase()
  req.body.loginId = req.body.email
  req.body.password = password

  return next()
}

const validateCrmMongoId = (paramName = 'id') => (req, _res, next) => {
  const value = req.params?.[paramName]

  if (!OBJECT_ID_PATTERN.test(String(value || ''))) {
    addValidationError(req, paramName, 'Invalid CRM resource ID')
  }

  return next()
}

const validateCreateCrmEmployee = (req, _res, next) => {
  normalizeRequiredText(req, 'name', 'Name', { min: 2, max: 120 })

  const email = normalizeEmail(req.body?.email)
  if (!email) {
    addValidationError(req, 'email', 'Email is required')
  } else if (!EMAIL_PATTERN.test(email)) {
    addValidationError(req, 'email', 'Please provide a valid email')
  }
  req.body.email = email

  validatePassword(req, 'password')
  validatePasswordConfirmation(req)
  req.body.role = 'crm_employee'

  return next()
}

const validateUpdateCrmEmployee = (req, _res, next) => {
  const body = req.body || {}
  const editableFields = ['name', 'email', 'password', 'isActive']
  const submittedFields = Object.keys(body).filter((field) => editableFields.includes(field))

  if (submittedFields.length === 0) {
    addValidationError(req, 'body', 'At least one editable employee field is required')
  }

  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    addValidationError(req, 'role', 'Employee role cannot be changed from this endpoint')
  }

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    normalizeRequiredText(req, 'name', 'Name', { min: 2, max: 120 })
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = normalizeEmail(body.email)
    if (!email) {
      addValidationError(req, 'email', 'Email is required')
    } else if (!EMAIL_PATTERN.test(email)) {
      addValidationError(req, 'email', 'Please provide a valid email')
    }
    req.body.email = email
  }

  if (Object.prototype.hasOwnProperty.call(body, 'password')) {
    validatePassword(req, 'password')
    validatePasswordConfirmation(req)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    if (typeof body.isActive === 'boolean') {
      req.body.isActive = body.isActive
    } else if (body.isActive === 'true' || body.isActive === 'false') {
      req.body.isActive = body.isActive === 'true'
    } else {
      addValidationError(req, 'isActive', 'isActive must be true or false')
    }
  }

  delete req.body.confirmPassword

  return next()
}

const validateCrmCandidate = (req, _res, next) => {
  normalizeRequiredText(req, 'candidateName', 'Candidate name', { min: 2, max: 150 })

  const mobileNumber = typeof req.body?.mobileNumber === 'string' ? req.body.mobileNumber.trim() : ''
  if (!mobileNumber) {
    addValidationError(req, 'mobileNumber', 'Mobile number is required')
  } else if (!MOBILE_PATTERN.test(mobileNumber)) {
    addValidationError(req, 'mobileNumber', 'Mobile number must be exactly 10 digits')
  }
  req.body.mobileNumber = mobileNumber

  normalizeRequiredText(req, 'education', 'Education', { max: 150 })
  normalizeRequiredText(req, 'jobNo', 'Job number', { max: 80 })
  normalizeRequiredText(req, 'jobProfile', 'Job profile', { max: 180 })
  normalizeRequiredText(req, 'availabilityForInterview', 'Availability for interview', { max: 180 })
  normalizeOptionalText(req, 'interviewDate', 'Interview date', { max: 30 })
  normalizeRequiredText(req, 'interviewTime', 'Interview time', { max: 120 })
  normalizeRequiredText(req, 'overallCallingRemark', 'Overall calling remark', { max: 3000 })
  normalizeRequiredEnum(req, 'candidateClass', 'Candidate class', CANDIDATE_CLASSES)
  normalizeRequiredEnum(req, 'registrationInfo', 'Source', REGISTRATION_INFO)
  normalizeRequiredEnum(req, 'callStatus', 'Call status', CALL_STATUSES)

  const interested = req.body?.interested && typeof req.body.interested === 'object' ? req.body.interested : {}
  const interestedStatus =
    typeof interested.status === 'string'
      ? interested.status.trim().toLowerCase()
      : typeof req.body?.interestedStatus === 'string'
        ? req.body.interestedStatus.trim().toLowerCase()
        : ''

  if (interestedStatus && !INTERESTED_STATUSES.includes(interestedStatus)) {
    addValidationError(req, 'interested.status', 'Interested status must be yes or no')
  }

  const reason =
    typeof interested.reason === 'string'
      ? interested.reason.trim()
      : typeof req.body?.interestedReason === 'string'
        ? req.body.interestedReason.trim()
        : ''

  if (interestedStatus === 'no' && !reason) {
    addValidationError(req, 'interested.reason', 'Reason for not interested is required when status is no')
  }

  if (reason.length > 1000) {
    addValidationError(req, 'interested.reason', 'Reason for not interested cannot exceed 1000 characters')
  }

  if (interestedStatus) {
    req.body.interested = {
      status: interestedStatus,
      ...(interestedStatus === 'no' ? { reason } : {})
    }
  } else {
    delete req.body.interested
  }

  delete req.body.interestedStatus
  delete req.body.interestedReason
  delete req.body.recruiterId

  return next()
}

const validateCrmCallLog = (req, _res, next) => {
  normalizeOptionalText(req, 'remark', 'Call remark', { max: 2000 })
  normalizeRequiredEnum(req, 'status', 'Call log status', CALL_LOG_STATUSES)

  if (req.body?.nextFollowup) {
    const followupDate = new Date(req.body.nextFollowup)

    if (Number.isNaN(followupDate.getTime())) {
      addValidationError(req, 'nextFollowup', 'Next follow-up must be a valid date')
    } else {
      req.body.nextFollowup = followupDate
    }
  } else {
    delete req.body.nextFollowup
  }

  return next()
}

module.exports = {
  sanitizeCrmBody,
  sanitizeString,
  validateCrmCallLog,
  validateCrmCandidate,
  validateCreateCrmEmployee,
  validateCrmLogin,
  validateCrmMongoId,
  validateInput,
  validateUpdateCrmEmployee
}
