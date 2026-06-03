const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const CompanyAdmin = require('../models/companyManagement/CompanyAdmin')
const CompanyInterviewInfo = require('../models/companyManagement/CompanyInterviewInfo')
const {
  COMPANY_ADMIN_COOKIE_NAME,
  COMPANY_ADMIN_SESSION_MARKER,
  companyAdminCookieOptions,
  clearCompanyAdminCookieOptions,
  tokenFromCompanyAdminRequest
} = require('../utils/companyAdminAuthCookie')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MAX_LENGTH = 72
const DUMMY_PASSWORD_HASH = '$2b$10$851oawsmsIi4AYoa79T2s.GGVhGw453ExsWo29K/gbtBQ.FD8VGk.'
const companyAdminJwtSecret = () => process.env.COMPANY_ADMIN_JWT_SECRET || process.env.JWT_SECRET

const requestBody = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {})
const nestedObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const digitsOnly = (value) => String(value || '').replace(/\D/g, '')

const validationError = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

const requiredText = (value, label, maxLength = 180) => {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${label} is required`)
  if (value.trim().length > maxLength) throw validationError(`${label} cannot exceed ${maxLength} characters`)
  return value.trim()
}

const optionalText = (value, label, maxLength = 500) => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw validationError(`${label} must be text`)
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.length > maxLength) throw validationError(`${label} cannot exceed ${maxLength} characters`)
  return normalized
}

const normalizeEmail = (value, label, { required = false } = {}) => {
  const normalized = required ? requiredText(value, label, 180).toLowerCase() : optionalText(value, label, 180)?.toLowerCase()
  if (normalized && !EMAIL_PATTERN.test(normalized)) throw validationError(`Enter a valid ${label.toLowerCase()}`)
  return normalized
}

const normalizeMobile = (value, label = 'Mobile number') => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' && typeof value !== 'number') throw validationError(`${label} must be a 10 digit number`)
  const normalized = digitsOnly(value)
  if (normalized.length !== 10) throw validationError(`${label} must be 10 digits`)
  return normalized
}

const normalizePassword = (value, label = 'Password') => {
  if (typeof value !== 'string' || !value) throw validationError(`${label} is required`)
  if (value.length < 6) throw validationError(`${label} must be at least 6 characters`)
  if (value.length > PASSWORD_MAX_LENGTH) throw validationError(`${label} cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
  return value
}

const normalizeChoice = (value, label, choices) => {
  const normalized = optionalText(value, label, 40)
  if (normalized && !choices.includes(normalized)) throw validationError(`Invalid ${label.toLowerCase()}`)
  return normalized
}

const normalizeTextList = (value, label, { maxItems = 30, maxLength = 120 } = {}) => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw validationError(`${label} must be a list`)
  if (value.length > maxItems) throw validationError(`${label} cannot contain more than ${maxItems} items`)

  return [...new Set(value.map((item) => optionalText(item, label, maxLength)).filter(Boolean))]
}

const normalizeVacancyCount = (value) => {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 0) throw validationError('Number of vacancy must be a whole number')
  return normalized
}

const normalizeDate = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw validationError(`${label} must be a valid date`)
  return date
}

const normalizeCompanyAdminPayload = (rawBody, { partial = false } = {}) => {
  const body = requestBody(rawBody)
  const payload = {}

  if (!partial || body.name !== undefined) payload.name = requiredText(body.name, 'Admin name', 120)
  if (!partial || body.companyName !== undefined) payload.companyName = requiredText(body.companyName, 'Company name', 180)
  if (!partial || body.email !== undefined) payload.email = normalizeEmail(body.email, 'Email', { required: true })
  if (!partial || body.mobileNo !== undefined) payload.mobileNo = normalizeMobile(body.mobileNo)
  if (!partial || body.password !== undefined) payload.password = normalizePassword(body.password)
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw validationError('isActive must be true or false')
    payload.isActive = body.isActive
  }

  return payload
}

const normalizeInterviewInfoPayload = (rawBody, defaultCompanyName) => {
  const body = requestBody(rawBody)
  const job = nestedObject(body.jobRequirements)
  const about = nestedObject(body.aboutCompany)
  const availability = nestedObject(about.availabilityForInterview)

  return {
    companyName: requiredText(body.companyName || defaultCompanyName, 'Company name', 180),
    companyAddress: optionalText(body.companyAddress, 'Company address', 500),
    contactPersonName: optionalText(body.contactPersonName, 'Contact person name', 120),
    contactPersonDesignation: optionalText(body.contactPersonDesignation, 'Contact person designation', 120),
    mobileNo: normalizeMobile(body.mobileNo),
    emailId: normalizeEmail(body.emailId, 'Email'),
    jobRequirements: {
      jobProfile: optionalText(job.jobProfile, 'Job profile', 180),
      education: optionalText(job.education, 'Education', 180),
      experience: optionalText(job.experience, 'Experience', 120),
      requiredKeySkills: normalizeTextList(job.requiredKeySkills, 'Required key skills'),
      rolesAndResponsibility: optionalText(job.rolesAndResponsibility, 'Roles and responsibility', 2000),
      salaryRange: optionalText(job.salaryRange, 'Salary range', 120),
      gender: normalizeChoice(job.gender, 'Gender', ['Male', 'Female', 'Any']),
      numberOfVacancy: normalizeVacancyCount(job.numberOfVacancy),
      jobTime: optionalText(job.jobTime, 'Job time', 120),
      shift: optionalText(job.shift, 'Shift', 120),
      jobLocation: optionalText(job.jobLocation, 'Job location', 300),
      ageCriteria: optionalText(job.ageCriteria, 'Age criteria', 120),
      castCriteria: optionalText(job.castCriteria, 'Caste criteria', 120),
      marriageCriteria: normalizeChoice(job.marriageCriteria, 'Marriage criteria', ['Married', 'Unmarried', 'Any']),
      facilities: normalizeTextList(job.facilities, 'Facilities')
    },
    aboutCompany: {
      manpower: optionalText(about.manpower, 'Manpower', 120),
      turnover: optionalText(about.turnover, 'Turnover', 120),
      plant: optionalText(about.plant, 'Plant', 180),
      availabilityForInterview: {
        date: normalizeDate(availability.date, 'Interview date'),
        time: optionalText(availability.time, 'Interview time', 120)
      },
      interviewMode: normalizeChoice(about.interviewMode, 'Interview mode', ['Online', 'Offline']),
      weeklyOff: normalizeTextList(about.weeklyOff, 'Weekly off', { maxItems: 7, maxLength: 30 })
    }
  }
}

const signCompanyAdminToken = (companyAdmin) =>
  jwt.sign(
    {
      id: companyAdmin._id,
      type: 'company_admin',
      tokenVersion: companyAdmin.tokenVersion || 0
    },
    companyAdminJwtSecret(),
    { expiresIn: '7d' }
  )

const login = async (req, res) => {
  const body = requestBody(req.body)
  const email = normalizeEmail(body.email, 'Email', { required: true })
  const password = normalizePassword(body.password)
  const companyAdmin = await CompanyAdmin.findOne({ email }).select('+password')

  if (!companyAdmin || !companyAdmin.isActive) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const matches = await bcrypt.compare(password, companyAdmin.password)
  if (!matches) return res.status(401).json({ message: 'Invalid email or password' })

  res.cookie(COMPANY_ADMIN_COOKIE_NAME, signCompanyAdminToken(companyAdmin), companyAdminCookieOptions())
  return res.json({ token: COMPANY_ADMIN_SESSION_MARKER, companyAdmin })
}

const logout = async (req, res) => {
  const token = tokenFromCompanyAdminRequest(req)

  if (token) {
    try {
      const decoded = jwt.verify(token, companyAdminJwtSecret(), { algorithms: ['HS256'] })
      if (decoded.type === 'company_admin' && decoded.id) {
        await CompanyAdmin.updateOne({ _id: decoded.id }, { $inc: { tokenVersion: 1 } })
      }
    } catch (_error) {
      // The cookie still needs clearing when a token is expired or malformed.
    }
  }

  res.clearCookie(COMPANY_ADMIN_COOKIE_NAME, clearCompanyAdminCookieOptions())
  return res.json({ message: 'Logged out' })
}

const me = async (req, res) => {
  res.json({ companyAdmin: req.companyAdmin })
}

const dashboard = async (req, res) => {
  const interviewInfo = await CompanyInterviewInfo.findOne({ companyAdminId: req.companyAdmin._id })
    .select('companyName jobRequirements.jobProfile jobRequirements.numberOfVacancy aboutCompany.availabilityForInterview updatedAt createdAt')
    .lean()

  res.json({
    companyAdmin: req.companyAdmin,
    interviewInfo,
    hasInterviewInfo: Boolean(interviewInfo)
  })
}

const getOwnInterviewInfo = async (req, res) => {
  const interviewInfo = await CompanyInterviewInfo.findOne({ companyAdminId: req.companyAdmin._id }).lean()
  res.json({ interviewInfo })
}

const saveOwnInterviewInfo = async (req, res) => {
  const payload = normalizeInterviewInfoPayload(req.body, req.companyAdmin.companyName)
  const interviewInfo = await CompanyInterviewInfo.findOneAndUpdate(
    { companyAdminId: req.companyAdmin._id },
    { $set: { ...payload, companyAdminId: req.companyAdmin._id } },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
  )

  res.json({ message: 'Company interview information saved', interviewInfo })
}

const summary = async (_req, res) => {
  const [totalAdmins, activeAdmins, submittedInterviewInfo] = await Promise.all([
    CompanyAdmin.countDocuments(),
    CompanyAdmin.countDocuments({ isActive: true }),
    CompanyInterviewInfo.countDocuments()
  ])

  res.json({ totalAdmins, activeAdmins, submittedInterviewInfo })
}

const listAdmins = async (_req, res) => {
  const [admins, interviewInfo] = await Promise.all([
    CompanyAdmin.find().sort({ createdAt: -1 }).lean(),
    CompanyInterviewInfo.find().select('companyAdminId updatedAt').lean()
  ])
  const infoByAdmin = new Map(interviewInfo.map((item) => [String(item.companyAdminId), item]))

  res.json({
    admins: admins.map((admin) => {
      const info = infoByAdmin.get(String(admin._id))
      const { tokenVersion: _tokenVersion, __v: _version, ...safeAdmin } = admin
      return {
        ...safeAdmin,
        hasInterviewInfo: Boolean(info),
        interviewInfoUpdatedAt: info?.updatedAt
      }
    })
  })
}

const createAdmin = async (req, res) => {
  const payload = normalizeCompanyAdminPayload(req.body)
  const existing = await CompanyAdmin.findOne({ email: payload.email }).select('_id')
  if (existing) return res.status(409).json({ message: 'A company admin with this email already exists' })

  payload.password = await bcrypt.hash(payload.password, 10)
  const companyAdmin = await CompanyAdmin.create(payload)
  res.status(201).json({ companyAdmin })
}

const updateAdmin = async (req, res) => {
  const payload = normalizeCompanyAdminPayload(req.body, { partial: true })
  delete payload.password
  const companyAdmin = await CompanyAdmin.findById(req.params.id)
  if (!companyAdmin) return res.status(404).json({ message: 'Company admin not found' })

  if (payload.email && payload.email !== companyAdmin.email) {
    const existing = await CompanyAdmin.findOne({ email: payload.email, _id: { $ne: companyAdmin._id } }).select('_id')
    if (existing) return res.status(409).json({ message: 'A company admin with this email already exists' })
  }

  const shouldRevokeSessions = payload.email !== undefined || payload.isActive !== undefined
  Object.assign(companyAdmin, payload)
  if (shouldRevokeSessions) companyAdmin.tokenVersion = Number(companyAdmin.tokenVersion || 0) + 1
  await companyAdmin.save()
  res.json({ companyAdmin })
}

const resetAdminPassword = async (req, res) => {
  const newPassword = normalizePassword(requestBody(req.body).newPassword, 'New password')
  const companyAdmin = await CompanyAdmin.findById(req.params.id).select('+password')
  if (!companyAdmin) return res.status(404).json({ message: 'Company admin not found' })

  companyAdmin.password = await bcrypt.hash(newPassword, 10)
  companyAdmin.tokenVersion = Number(companyAdmin.tokenVersion || 0) + 1
  await companyAdmin.save()
  res.json({ message: 'Company admin password reset successfully' })
}

const deleteAdmin = async (req, res) => {
  const companyAdmin = await CompanyAdmin.findById(req.params.id)
  if (!companyAdmin) return res.status(404).json({ message: 'Company admin not found' })

  const hasInterviewInfo = await CompanyInterviewInfo.exists({ companyAdminId: companyAdmin._id })
  if (hasInterviewInfo) {
    return res.status(409).json({
      message: 'Company admin has submitted interview information. Deactivate the account to preserve the record.'
    })
  }

  await companyAdmin.deleteOne()
  res.json({ message: 'Company admin removed' })
}

const listInterviewInfo = async (_req, res) => {
  const interviewInfo = await CompanyInterviewInfo.find()
    .populate('companyAdminId', 'name companyName email mobileNo isActive')
    .sort({ updatedAt: -1 })
    .lean()

  res.json({ interviewInfo })
}

module.exports = {
  createAdmin,
  dashboard,
  deleteAdmin,
  getOwnInterviewInfo,
  listAdmins,
  listInterviewInfo,
  login,
  logout,
  me,
  resetAdminPassword,
  saveOwnInterviewInfo,
  summary,
  updateAdmin
}
