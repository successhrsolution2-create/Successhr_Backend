const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const CompanyAdmin = require('../models/companyManagement/CompanyAdmin')
const CompanyInterviewInfo = require('../models/companyManagement/CompanyInterviewInfo')
const CompanyVacancy = require('../models/companyManagement/CompanyVacancy')
const { ensureLoginIdentityAvailable } = require('../utils/loginIdentity')
const { uploadToS3 } = require('../utils/s3Upload')
const { validateUploadFile } = require('../utils/fileValidation')
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

const normalizeTextListInput = (value, label, options = {}) => {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return normalizeTextList(value, label, options)

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return normalizeTextList(parsed, label, options)
    } catch {
      return normalizeTextList(trimmed.split(',').map((item) => item.trim()), label, options)
    }
  }

  throw validationError(`${label} must be a list`)
}

const normalizeVacancyCount = (value) => {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 0) throw validationError('Number of vacancy must be a whole number')
  return normalized
}

const normalizeMoney = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) throw validationError(`${label} must be a valid positive amount`)
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

const normalizeInterviewInfoPayload = (rawBody, defaultCompanyName, { allowPlacementFeedback = false, requireCandidateName = true } = {}) => {
  const body = requestBody(rawBody)
  const job = nestedObject(body.jobRequirements)
  const about = nestedObject(body.aboutCompany)
  const availability = nestedObject(about.availabilityForInterview)
  const candidate = nestedObject(body.candidateInterview)
  const offer = nestedObject(candidate.offerDetails)
  const vacancy = nestedObject(body.manpowerVacancy)
  const source = { ...body, ...candidate, ...offer, ...vacancy }
  const interviewStatus = normalizeChoice(source.interviewStatus, 'Interview status', ['Selected', 'Rejected', 'Hold', 'Pending']) || 'Pending'
  const interestedForJoin = normalizeChoice(source.interestedForJoin, 'Interested for join', ['Yes', 'No'])
  const normalized = {
    companyName: requiredText(body.companyName || defaultCompanyName, 'Company name', 180),
    companyAddress: optionalText(body.companyAddress, 'Company address', 500),
    contactPersonName: optionalText(body.contactPersonName, 'Contact person name', 120),
    contactPersonDesignation: optionalText(body.contactPersonDesignation, 'Contact person designation', 120),
    mobileNo: normalizeMobile(body.mobileNo),
    emailId: normalizeEmail(body.emailId, 'Email'),
    candidateInterview: {
      candidateName: requireCandidateName
        ? requiredText(source.candidateName, 'Candidate name', 180)
        : optionalText(source.candidateName, 'Candidate name', 180),
      gender: normalizeChoice(source.gender, 'Gender', ['Male', 'Female', 'Other']),
      education: optionalText(source.education || source.candidateEducation, 'Education', 180),
      department: optionalText(source.candidateDepartment || source.department, 'Department', 180),
      interviewDateTime: normalizeDate(source.interviewDateTime, 'Interview date and time'),
      attendedInterview: normalizeChoice(source.attendedInterview, 'Attend interview', ['Yes', 'No']),
      interestedForJoin,
      notInterestedReason: interestedForJoin === 'No' ? optionalText(source.notInterestedReason, 'Not interested reason', 1000) : undefined,
      feedbackFromCompany: normalizeChoice(source.feedbackFromCompany, 'Feedback from company', ['Yes', 'No', 'Pending']) || 'Pending',
      feedbackFromPlacement: allowPlacementFeedback
        ? normalizeChoice(source.feedbackFromPlacement, 'Feedback from placement', ['Yes', 'No', 'Pending']) || 'Pending'
        : undefined,
      interviewStatus,
      offerDetails: interviewStatus === 'Selected'
        ? {
            netSalary: normalizeMoney(source.netSalary, 'Net salary'),
            grossSalary: normalizeMoney(source.grossSalary, 'Gross salary'),
            ctc: normalizeMoney(source.ctc, 'CTC'),
            department: optionalText(source.offerDepartment, 'Offer department', 180),
            expectedDoj: normalizeDate(source.expectedDoj, 'Expected DOJ')
          }
        : {}
    },
    manpowerVacancy: {
      jobProfile: optionalText(source.jobProfile || job.jobProfile, 'Job profile', 180),
      department: optionalText(source.vacancyDepartment, 'Vacancy department', 180),
      numberOfVacancy: normalizeVacancyCount(source.numberOfVacancy || job.numberOfVacancy),
      education: optionalText(source.vacancyEducation || job.education, 'Vacancy education', 180),
      experience: optionalText(source.experience || job.experience, 'Experience', 120),
      salaryRange: optionalText(source.salaryRange || job.salaryRange, 'Salary range', 120),
      jobTime: optionalText(source.jobTime || job.jobTime, 'Job time', 120),
      shift: optionalText(source.shift || job.shift, 'Shift', 120),
      jobLocation: optionalText(source.jobLocation || job.jobLocation, 'Job location', 300),
      requiredKeySkills: normalizeTextListInput(source.requiredKeySkills || job.requiredKeySkills, 'Required key skills'),
      rolesAndResponsibility: optionalText(source.rolesAndResponsibility || job.rolesAndResponsibility, 'Roles and responsibility', 2000),
      facilities: normalizeTextListInput(source.facilities || job.facilities, 'Facilities'),
      weeklyOff: normalizeTextListInput(source.weeklyOff || about.weeklyOff, 'Weekly off', { maxItems: 7, maxLength: 30 }),
      manpower: optionalText(source.manpower || about.manpower, 'Manpower', 120),
      turnover: optionalText(source.turnover || about.turnover, 'Turnover', 120),
      plant: optionalText(source.plant || about.plant, 'Plant', 180)
    },
    jobRequirements: {
      jobProfile: optionalText(source.jobProfile || job.jobProfile, 'Job profile', 180),
      education: optionalText(source.vacancyEducation || job.education, 'Education', 180),
      experience: optionalText(source.experience || job.experience, 'Experience', 120),
      requiredKeySkills: normalizeTextListInput(source.requiredKeySkills || job.requiredKeySkills, 'Required key skills'),
      rolesAndResponsibility: optionalText(source.rolesAndResponsibility || job.rolesAndResponsibility, 'Roles and responsibility', 2000),
      salaryRange: optionalText(source.salaryRange || job.salaryRange, 'Salary range', 120),
      gender: normalizeChoice(source.gender || job.gender, 'Gender', ['Male', 'Female', 'Any', 'Other']) === 'Other' ? 'Any' : normalizeChoice(source.gender || job.gender, 'Gender', ['Male', 'Female', 'Any', 'Other']),
      numberOfVacancy: normalizeVacancyCount(source.numberOfVacancy || job.numberOfVacancy),
      jobTime: optionalText(source.jobTime || job.jobTime, 'Job time', 120),
      shift: optionalText(source.shift || job.shift, 'Shift', 120),
      jobLocation: optionalText(source.jobLocation || job.jobLocation, 'Job location', 300),
      ageCriteria: optionalText(job.ageCriteria, 'Age criteria', 120),
      castCriteria: optionalText(job.castCriteria, 'Caste criteria', 120),
      marriageCriteria: normalizeChoice(job.marriageCriteria, 'Marriage criteria', ['Married', 'Unmarried', 'Any']),
      facilities: normalizeTextListInput(source.facilities || job.facilities, 'Facilities')
    },
    aboutCompany: {
      manpower: optionalText(source.manpower || about.manpower, 'Manpower', 120),
      turnover: optionalText(source.turnover || about.turnover, 'Turnover', 120),
      plant: optionalText(source.plant || about.plant, 'Plant', 180),
      availabilityForInterview: {
        date: normalizeDate(source.interviewDate || availability.date, 'Interview date'),
        time: optionalText(source.interviewTime || availability.time, 'Interview time', 120)
      },
      interviewMode: normalizeChoice(about.interviewMode, 'Interview mode', ['Online', 'Offline']),
      weeklyOff: normalizeTextListInput(source.weeklyOff || about.weeklyOff, 'Weekly off', { maxItems: 7, maxLength: 30 })
    }
  }

  if (!allowPlacementFeedback) delete normalized.candidateInterview.feedbackFromPlacement

  return normalized
}

const normalizeVacancyPayload = (rawBody, defaultCompanyName) => {
  const body = requestBody(rawBody)
  const vacancy = nestedObject(body.manpowerVacancy)
  const job = nestedObject(body.jobRequirements)
  const about = nestedObject(body.aboutCompany)
  const source = { ...body, ...vacancy, ...job, ...about }

  return {
    companyName: requiredText(body.companyName || defaultCompanyName, 'Company name', 180),
    jobProfile: requiredText(source.jobProfile, 'Job profile', 180),
    department: optionalText(source.vacancyDepartment || source.department, 'Department', 180),
    numberOfVacancy: normalizeVacancyCount(source.numberOfVacancy),
    education: optionalText(source.vacancyEducation || source.education, 'Education', 180),
    experience: optionalText(source.experience, 'Experience', 120),
    salaryRange: optionalText(source.salaryRange, 'Salary range', 120),
    jobTime: optionalText(source.jobTime, 'Job time', 120),
    shift: optionalText(source.shift, 'Shift', 120),
    jobLocation: optionalText(source.jobLocation, 'Job location', 300),
    requiredKeySkills: normalizeTextListInput(source.requiredKeySkills, 'Required key skills'),
    rolesAndResponsibility: optionalText(source.rolesAndResponsibility, 'Roles and responsibility', 2000),
    facilities: normalizeTextListInput(source.facilities, 'Facilities'),
    weeklyOff: normalizeTextListInput(source.weeklyOff, 'Weekly off', { maxItems: 7, maxLength: 30 }),
    manpower: optionalText(source.manpower, 'Manpower', 120),
    turnover: optionalText(source.turnover, 'Turnover', 120),
    plant: optionalText(source.plant, 'Plant', 180)
  }
}

const legacyCompanyInterviewUniqueIndexDropped = { value: false }

const dropLegacyCompanyInterviewUniqueIndex = async () => {
  if (legacyCompanyInterviewUniqueIndexDropped.value) return

  try {
    const indexes = await CompanyInterviewInfo.collection.indexes()
    const legacyIndex = indexes.find((index) => index.name === 'companyAdminId_1' && index.unique)
    if (legacyIndex) await CompanyInterviewInfo.collection.dropIndex('companyAdminId_1')
  } catch {
    // A missing collection or index should not block normal form usage.
  } finally {
    legacyCompanyInterviewUniqueIndexDropped.value = true
  }
}

const fileFromRequest = (files, field) => {
  const value = files?.[field]
  if (Array.isArray(value)) return value[0]
  return value
}

const uploadInterviewDocument = async (file) => {
  if (!file) return undefined
  validateUploadFile(file)
  const fileUrl = await uploadToS3(file, 'company-interview-documents')

  return {
    fileName: file.originalname,
    fileUrl,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date()
  }
}

const attachInterviewFiles = async (payload, files = {}, existing = null) => {
  const next = {
    ...payload,
    candidateInterview: {
      ...payload.candidateInterview,
      offerDetails: {
        ...(payload.candidateInterview?.offerDetails || {})
      }
    }
  }

  const resume = await uploadInterviewDocument(fileFromRequest(files, 'resume'))
  next.candidateInterview.resume = resume || existing?.candidateInterview?.resume

  if (next.candidateInterview.interviewStatus === 'Selected') {
    const offerLetter = await uploadInterviewDocument(fileFromRequest(files, 'offerLetter'))
    const appointmentLetter = await uploadInterviewDocument(fileFromRequest(files, 'appointmentLetter'))
    next.candidateInterview.offerDetails.offerLetter = offerLetter || existing?.candidateInterview?.offerDetails?.offerLetter
    next.candidateInterview.offerDetails.appointmentLetter = appointmentLetter || existing?.candidateInterview?.offerDetails?.appointmentLetter
  }

  return next
}

const populateInterviewInfo = (query) => query.populate('companyAdminId', 'name companyName email mobileNo isActive')

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
    } catch {
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
  const [submissionCount, vacancyCount, latestInterviewInfo, latestVacancy] = await Promise.all([
    CompanyInterviewInfo.countDocuments({ companyAdminId: req.companyAdmin._id }),
    CompanyVacancy.countDocuments({ companyAdminId: req.companyAdmin._id }),
    CompanyInterviewInfo.findOne({ companyAdminId: req.companyAdmin._id })
      .select('companyName candidateInterview.candidateName candidateInterview.interviewStatus manpowerVacancy.jobProfile manpowerVacancy.numberOfVacancy updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .lean(),
    CompanyVacancy.findOne({ companyAdminId: req.companyAdmin._id })
      .select('companyName jobProfile department numberOfVacancy jobLocation updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .lean()
  ])

  res.json({
    companyAdmin: req.companyAdmin,
    interviewInfo: latestInterviewInfo,
    latestVacancy,
    submissionCount,
    vacancyCount,
    hasInterviewInfo: submissionCount > 0,
    hasVacancies: vacancyCount > 0
  })
}

const getOwnInterviewInfo = async (req, res) => {
  const interviewInfo = await CompanyInterviewInfo.find({ companyAdminId: req.companyAdmin._id })
    .sort({ updatedAt: -1 })
    .lean()
  res.json({ interviewInfo, records: interviewInfo })
}

const saveOwnInterviewInfo = async (req, res) => {
  await dropLegacyCompanyInterviewUniqueIndex()
  const existing = await CompanyInterviewInfo.findOne({ companyAdminId: req.companyAdmin._id }).sort({ updatedAt: -1 })
  const payload = await attachInterviewFiles(
    normalizeInterviewInfoPayload(req.body, req.companyAdmin.companyName, { requireCandidateName: false }),
    req.files,
    existing
  )
  const interviewInfo = existing || new CompanyInterviewInfo({ companyAdminId: req.companyAdmin._id })
  interviewInfo.set({ ...payload, companyAdminId: req.companyAdmin._id })
  await interviewInfo.save()

  res.json({ message: 'Company interview information saved', interviewInfo })
}

const createOwnInterviewInfo = async (req, res) => {
  await dropLegacyCompanyInterviewUniqueIndex()
  const payload = await attachInterviewFiles(
    normalizeInterviewInfoPayload(req.body, req.companyAdmin.companyName),
    req.files
  )
  const interviewInfo = await CompanyInterviewInfo.create({ ...payload, companyAdminId: req.companyAdmin._id })
  res.status(201).json({ message: 'Candidate interview information saved', interviewInfo })
}

const updateOwnInterviewInfo = async (req, res) => {
  await dropLegacyCompanyInterviewUniqueIndex()
  const interviewInfo = await CompanyInterviewInfo.findOne({ _id: req.params.id, companyAdminId: req.companyAdmin._id })
  if (!interviewInfo) return res.status(404).json({ message: 'Candidate interview information not found' })

  const payload = await attachInterviewFiles(
    normalizeInterviewInfoPayload(req.body, req.companyAdmin.companyName),
    req.files,
    interviewInfo
  )
  const existingPlacementFeedback = interviewInfo.candidateInterview?.feedbackFromPlacement || 'Pending'
  interviewInfo.set({ ...payload, companyAdminId: req.companyAdmin._id })
  interviewInfo.candidateInterview.feedbackFromPlacement = existingPlacementFeedback
  await interviewInfo.save()

  res.json({ message: 'Candidate interview information updated', interviewInfo })
}

const listOwnVacancies = async (req, res) => {
  const vacancies = await CompanyVacancy.find({ companyAdminId: req.companyAdmin._id })
    .sort({ updatedAt: -1 })
    .lean()

  res.json({ vacancies })
}

const createOwnVacancy = async (req, res) => {
  const payload = normalizeVacancyPayload(req.body, req.companyAdmin.companyName)
  const vacancy = await CompanyVacancy.create({ ...payload, companyAdminId: req.companyAdmin._id })

  res.status(201).json({ message: 'Vacancy information saved', vacancy })
}

const updateOwnVacancy = async (req, res) => {
  const vacancy = await CompanyVacancy.findOne({ _id: req.params.id, companyAdminId: req.companyAdmin._id })
  if (!vacancy) return res.status(404).json({ message: 'Vacancy information not found' })

  vacancy.set(normalizeVacancyPayload(req.body, req.companyAdmin.companyName))
  await vacancy.save()

  res.json({ message: 'Vacancy information updated', vacancy })
}

const summary = async (_req, res) => {
  const [totalAdmins, activeAdmins, submittedInterviewInfo, submittedVacancies] = await Promise.all([
    CompanyAdmin.countDocuments(),
    CompanyAdmin.countDocuments({ isActive: true }),
    CompanyInterviewInfo.countDocuments(),
    CompanyVacancy.countDocuments()
  ])

  res.json({ totalAdmins, activeAdmins, submittedInterviewInfo, submittedVacancies })
}

const listAdmins = async (_req, res) => {
  const [admins, interviewInfo] = await Promise.all([
    CompanyAdmin.find().sort({ createdAt: -1 }).lean(),
    CompanyInterviewInfo.find().select('companyAdminId updatedAt').lean()
  ])
  const infoByAdmin = new Map()
  interviewInfo.forEach((item) => {
    const key = String(item.companyAdminId)
    const current = infoByAdmin.get(key)
    infoByAdmin.set(key, {
      count: Number(current?.count || 0) + 1,
      updatedAt: !current?.updatedAt || new Date(item.updatedAt) > new Date(current.updatedAt) ? item.updatedAt : current.updatedAt
    })
  })

  res.json({
    admins: admins.map((admin) => {
      const info = infoByAdmin.get(String(admin._id))
      const { tokenVersion: _tokenVersion, __v: _version, ...safeAdmin } = admin
      return {
        ...safeAdmin,
        hasInterviewInfo: Boolean(info),
        interviewInfoCount: info?.count || 0,
        interviewInfoUpdatedAt: info?.updatedAt
      }
    })
  })
}

const createAdmin = async (req, res) => {
  const payload = normalizeCompanyAdminPayload(req.body)
  await ensureLoginIdentityAvailable({ email: payload.email })

  payload.password = await bcrypt.hash(payload.password, 12)
  const companyAdmin = await CompanyAdmin.create(payload)
  res.status(201).json({ companyAdmin })
}

const updateAdmin = async (req, res) => {
  const payload = normalizeCompanyAdminPayload(req.body, { partial: true })
  delete payload.password
  const companyAdmin = await CompanyAdmin.findById(req.params.id)
  if (!companyAdmin) return res.status(404).json({ message: 'Company admin not found' })

  if (payload.email && payload.email !== companyAdmin.email) {
    await ensureLoginIdentityAvailable({ email: payload.email }, { exclude: { companyAdmin: companyAdmin._id } })
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

  companyAdmin.password = await bcrypt.hash(newPassword, 12)
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
  await dropLegacyCompanyInterviewUniqueIndex()
  const interviewInfo = await populateInterviewInfo(CompanyInterviewInfo.find())
    .sort({ updatedAt: -1 })
    .lean()

  res.json({ interviewInfo })
}

const listVacancies = async (_req, res) => {
  const vacancies = await CompanyVacancy.find()
    .populate('companyAdminId', 'name companyName email mobileNo isActive')
    .sort({ updatedAt: -1 })
    .lean()

  res.json({ vacancies })
}

const updateInterviewPlacementFeedback = async (req, res) => {
  const feedbackFromPlacement = normalizeChoice(
    requestBody(req.body).feedbackFromPlacement,
    'Feedback from placement',
    ['Yes', 'No', 'Pending']
  ) || 'Pending'

  const interviewInfo = await CompanyInterviewInfo.findById(req.params.id)
  if (!interviewInfo) return res.status(404).json({ message: 'Candidate interview information not found' })

  interviewInfo.candidateInterview = {
    ...(interviewInfo.candidateInterview?.toObject?.() || interviewInfo.candidateInterview || {}),
    feedbackFromPlacement
  }
  await interviewInfo.save()

  const populated = await populateInterviewInfo(CompanyInterviewInfo.findById(interviewInfo._id)).lean()
  res.json({ message: 'Placement feedback updated', interviewInfo: populated })
}

module.exports = {
  createAdmin,
  createOwnInterviewInfo,
  createOwnVacancy,
  dashboard,
  deleteAdmin,
  getOwnInterviewInfo,
  listOwnVacancies,
  listAdmins,
  listInterviewInfo,
  listVacancies,
  login,
  logout,
  me,
  resetAdminPassword,
  saveOwnInterviewInfo,
  summary,
  updateAdmin,
  updateInterviewPlacementFeedback,
  updateOwnInterviewInfo,
  updateOwnVacancy
}
