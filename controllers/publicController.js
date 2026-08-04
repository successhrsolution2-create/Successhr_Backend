const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsPdfShare = require('../models/cms/CmsPdfShare')
const CmsRemark = require('../models/cms/CmsRemark')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const User = require('../models/User')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { nextCandidateCode } = require('../utils/cmsCandidateCode')
const { invalidateCache } = require('../src/utils/invalidateCache')
const { uploadToS3 } = require('../utils/s3Upload')
const { validateUploadFile } = require('../utils/fileValidation')
const { generateSuccessRemarkPdf, successRemarkPdfFileName } = require('../utils/successRemarkPdf')
const {
  candidateDocumentAllowedExtensionsByKey,
  candidateDocumentAllowedMimeTypesByKey,
  candidateDocumentLabelByKey,
  isCandidateDocumentKey
} = require('../utils/candidateDocuments')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const pdfSharePurpose = 'success-remark-pdf'
const candidatePortalPurpose = 'candidate-portal'
const candidatePortalTokenMaxAge = '30d'
const hashPdfShareCode = (code) => crypto.createHash('sha256').update(String(code || '')).digest('hex')
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const parseOptionalNumber = (value) => {
  if (value === '' || value === undefined || value === null) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}
const text = (value) => String(value || '').trim()
const normalizePan = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const pickOption = (value, options) => {
  const normalized = String(value || '').trim()
  return options.includes(normalized) ? normalized : undefined
}
const normalizeSiblingDetails = (value = {}) => {
  const sibling = {
    siblingName: text(value.siblingName),
    siblingEducation: text(value.siblingEducation || value.siblingEducationOccupation),
    siblingMobileNumber: toDigits(value.siblingMobileNumber) || undefined,
    siblingDateOfBirth: value.siblingDateOfBirth || undefined,
    siblingAge: parseOptionalNumber(value.siblingAge),
    siblingGender: pickOption(value.siblingGender, ['Male', 'Female', 'Other']),
    siblingCareerProfile: text(value.siblingCareerProfile),
    siblingStudyStandard: value.siblingCareerProfile === 'Studying' ? text(value.siblingStudyStandard) : '',
    siblingStudyStandardOther: value.siblingCareerProfile === 'Studying' && value.siblingStudyStandard === 'Other' ? text(value.siblingStudyStandardOther) : '',
    siblingCareerProfileOther: value.siblingCareerProfile === 'Other' ? text(value.siblingCareerProfileOther) : ''
  }

  return sibling
}
const siblingHasValue = (sibling = {}) =>
  Object.values(sibling).some((value) => value !== undefined && value !== null && String(value).trim() !== '')
const parseSiblingArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (_error) {
    return []
  }
}
const getSiblingList = (payload = {}) => {
  const family = payload.familyDetails || {}
  const rawSiblings = parseSiblingArray(family.siblings).length
    ? parseSiblingArray(family.siblings)
    : parseSiblingArray(payload.siblings)

  const siblings = rawSiblings
    .map((item) => normalizeSiblingDetails(item))
    .filter(siblingHasValue)

  if (!siblings.length) {
    const legacySibling = normalizeSiblingDetails({
      siblingName: payload.siblingName || family.siblingName,
      siblingEducation: payload.siblingEducation || family.siblingEducation || payload.siblingEducationOccupation || family.siblingEducationOccupation,
      siblingMobileNumber: payload.siblingMobileNumber || family.siblingMobileNumber,
      siblingDateOfBirth: payload.siblingDateOfBirth || family.siblingDateOfBirth,
      siblingAge: payload.siblingAge || family.siblingAge,
      siblingGender: payload.siblingGender || family.siblingGender,
      siblingCareerProfile: payload.siblingCareerProfile || family.siblingCareerProfile,
      siblingStudyStandard: payload.siblingStudyStandard || family.siblingStudyStandard,
      siblingStudyStandardOther: payload.siblingStudyStandardOther || family.siblingStudyStandardOther,
      siblingCareerProfileOther: payload.siblingCareerProfileOther || family.siblingCareerProfileOther
    })

    if (siblingHasValue(legacySibling)) siblings.push(legacySibling)
  }

  return siblings
}

const parseApplicationDetails = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value

  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_error) {
    return {}
  }
}

const normalizePublicApplyState = (value) => {
  const parsed = parseApplicationDetails(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

const validateCandidatePassword = (password, confirmPassword) => {
  const nextPassword = String(password || '')
  const nextConfirmPassword = String(confirmPassword || '')

  if (nextPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters')
    error.statusCode = 400
    throw error
  }

  if (nextPassword.length > 72) {
    const error = new Error('Password must be 72 characters or less')
    error.statusCode = 400
    throw error
  }

  if (nextPassword !== nextConfirmPassword) {
    const error = new Error('Password and confirm password do not match')
    error.statusCode = 400
    throw error
  }

  return nextPassword
}

const signCandidatePortalToken = (candidate) =>
  jwt.sign(
    {
      purpose: candidatePortalPurpose,
      candidateId: String(candidate._id),
      candidateCode: candidate.candidateCode
    },
    process.env.JWT_SECRET,
    { expiresIn: candidatePortalTokenMaxAge, algorithm: 'HS256' }
  )

const verifyCandidatePortalToken = async (req) => {
  const authHeader = String(req.headers.authorization || '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return null

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch (_error) {
    return null
  }

  if (decoded?.purpose !== candidatePortalPurpose || !decoded?.candidateId) return null
  return CmsCandidate.findById(decoded.candidateId).select('+candidatePortal.passwordHash')
}

const parseStructuredField = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value

  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (_error) {
    return {}
  }
}

const remarkKeys = [
  'documentsSubmitted',
  'offerLetterReceived',
  'appointmentLetterGiven',
  'joiningDateConfirmed',
  'joiningCompleted',
  'pfEnrolled',
  'esicEnrolled',
  'backgroundCheckDone',
  'trainingCompleted',
  'idCardIssued',
  'uniformProvided',
  'salaryAccountOpened',
  'firstSalaryReceived',
  'probationCompleted',
  'permanentEmployment',
  'exitFormalitiesDone',
  'noDuesCertificate',
  'experienceLetterGiven',
  'relievingLetterGiven',
  'feedbackCollected'
]

const defaultCheckboxes = () =>
  remarkKeys.reduce((acc, key) => {
    acc[key] = { checked: false, updatedAt: null }
    return acc
  }, {})

const normalizeApplicationPayload = (body) => {
  const payload = { ...body }

  payload.formMeta = parseStructuredField(payload.formMeta)
  payload.familyDetails = parseStructuredField(payload.familyDetails)
  payload.placementReference = parseStructuredField(payload.placementReference)

  payload.formMeta = {
    day: text(payload.formMeta?.day),
    receiptNo: text(payload.formMeta?.receiptNo),
    rcWrc: text(payload.formMeta?.rcWrc),
    date: payload.formMeta?.date || undefined
  }
  payload.candidateName = String(payload.candidateName || '').trim()
  payload.collegeName = text(payload.collegeName)
  payload.mobileNumber = toDigits(payload.mobileNumber)
  payload.whatsappNo = toDigits(payload.whatsappNo) || undefined
  payload.aadhaarNo = toDigits(payload.aadhaarNo) || undefined
  payload.panNo = normalizePan(payload.panNo) || undefined
  payload.emailId = normalizeEmail(payload.emailId) || undefined
  payload.dateOfBirth = payload.dateOfBirth || undefined
  payload.gender = pickOption(payload.gender, ['Male', 'Female', 'Other'])
  payload.currentAge = parseOptionalNumber(payload.currentAge)
  payload.currentAddress = text(payload.currentAddress)
  payload.permanentAddress = text(payload.permanentAddress)
  payload.education = text(payload.education)
  payload.yearOfHigherEducation = text(payload.yearOfHigherEducation)
  payload.computerCourses = text(payload.computerCourses)
  payload.otherAchievements = text(payload.otherAchievements)
  payload.placementReference = {
    professorName: text(payload.professorName || payload.placementReference?.professorName),
    professorContactNumber: toDigits(payload.professorContactNumber || payload.placementReference?.professorContactNumber) || undefined,
    referenceBy: text(payload.referenceBy || payload.placementReference?.referenceBy),
    referenceContactNumber: toDigits(payload.referenceContactNumber || payload.placementReference?.referenceContactNumber) || undefined
  }

  payload.totalExperience = parseOptionalNumber(payload.totalExperience)
  payload.experienceDepartment = text(payload.experienceDepartment)
  payload.currentCompany = text(payload.currentCompany)
  payload.keyResponsibilities = text(payload.keyResponsibilities)
  payload.currentSalary = text(payload.currentSalary)
  payload.expectedSalary = text(payload.expectedSalary)
  payload.noticePeriod = parseOptionalNumber(payload.noticePeriod)
  payload.careerSummary = text(payload.careerSummary)
  payload.reasonForJobChange = text(payload.reasonForJobChange)
  payload.appliedFor = text(payload.appliedFor)
  payload.interestedDepartment = text(payload.interestedDepartment)
  payload.lookingForField = text(payload.lookingForField)
  payload.preferredIndustry = text(payload.preferredIndustry)
  payload.preferredJobLocation = text(payload.preferredJobLocation)
  payload.currentJobLocation = text(payload.currentJobLocation)
  payload.currentJobLocationOther = payload.currentJobLocation === 'Other'
    ? text(payload.currentJobLocationOther)
    : ''
  payload.currentJobLocationMidcArea = text(payload.currentJobLocationMidcArea)
  payload.currentJobLocationMidcAreaOther = payload.currentJobLocationMidcArea === 'Other'
    ? text(payload.currentJobLocationMidcAreaOther)
    : ''
  payload.availabilityForInterview = text(payload.availabilityForInterview)
  payload.interviewMode = text(payload.interviewMode)
  const siblings = getSiblingList(payload)
  const firstSibling = siblings[0] || {}

  payload.familyDetails = {
    fatherOrHusbandName: text(payload.fatherOrHusbandName || payload.familyDetails?.fatherOrHusbandName),
    fatherOccupation: text(payload.fatherOccupation || payload.familyDetails?.fatherOccupation),
    fatherMobileNumber: toDigits(payload.fatherMobileNumber || payload.familyDetails?.fatherMobileNumber) || undefined,
    motherOrWifeName: text(payload.motherOrWifeName || payload.familyDetails?.motherOrWifeName),
    motherOccupation: text(payload.motherOccupation || payload.familyDetails?.motherOccupation),
    motherMobileNumber: toDigits(payload.motherMobileNumber || payload.familyDetails?.motherMobileNumber) || undefined,
    siblingName: text(firstSibling.siblingName),
    siblingEducation: text(firstSibling.siblingEducation),
    siblingMobileNumber: firstSibling.siblingMobileNumber,
    siblingDateOfBirth: firstSibling.siblingDateOfBirth,
    siblingAge: firstSibling.siblingAge,
    siblingGender: firstSibling.siblingGender,
    siblingStudyStandard: text(firstSibling.siblingStudyStandard),
    siblingStudyStandardOther: text(firstSibling.siblingStudyStandardOther),
    siblingCareerProfile: text(firstSibling.siblingCareerProfile),
    siblingCareerProfileOther: text(firstSibling.siblingCareerProfileOther),
    siblings,
    brotherOccupation: text(payload.familyDetails?.brotherOccupation),
    sisterOccupation: text(payload.familyDetails?.sisterOccupation)
  }
  payload.goalAim = text(payload.goalAim)
  payload.feedback = text(payload.feedback)
  payload.suggestion = text(payload.suggestion)
  payload.marriageStatus = pickOption(payload.marriageStatus, ['Married', 'Unmarried', 'Single', 'Widow'])
  payload.applicationDetails = parseApplicationDetails(payload.applicationDetails)
  payload.publicApplyState = normalizePublicApplyState(payload.publicApplyState)

  if (!payload.candidateName || !payload.mobileNumber) {
    const error = new Error('Candidate name and mobile number are required')
    error.statusCode = 400
    throw error
  }

  if (payload.mobileNumber.length !== 10) {
    const error = new Error('Mobile number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  if (payload.whatsappNo && payload.whatsappNo.length !== 10) {
    const error = new Error('WhatsApp number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  if (payload.aadhaarNo && payload.aadhaarNo.length !== 12) {
    const error = new Error('Aadhaar number must be 12 digits')
    error.statusCode = 400
    throw error
  }

  if (payload.panNo && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payload.panNo)) {
    const error = new Error('Enter a valid PAN number')
    error.statusCode = 400
    throw error
  }

  if (payload.emailId && !emailRegex.test(payload.emailId)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  const contactChecks = [
    [payload.placementReference.professorContactNumber, 'Professor / Staff / TPO contact number'],
    [payload.placementReference.referenceContactNumber, 'Reference contact number'],
    [payload.familyDetails.fatherMobileNumber, 'Father mobile number'],
    [payload.familyDetails.motherMobileNumber, 'Mother mobile number'],
    [payload.familyDetails.siblingMobileNumber, 'Sibling mobile number'],
    ...payload.familyDetails.siblings.map((sibling, index) => [sibling.siblingMobileNumber, `Sibling ${index + 1} mobile number`])
  ]

  for (const [value, label] of contactChecks) {
    if (value && value.length !== 10) {
      const error = new Error(`${label} must be 10 digits`)
      error.statusCode = 400
      throw error
    }
  }

  return payload
}

const ensureUniqueApplicationIdentity = async (payload, excludeCmsCandidateId = null, excludeCandidateId = null) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo },
    { field: 'panNo', label: 'PAN number', value: payload.panNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const cmsQuery = { [check.field]: check.value }
    if (excludeCmsCandidateId) cmsQuery._id = { $ne: excludeCmsCandidateId }
    const candidateQuery = { [check.field]: check.value }
    if (excludeCandidateId) candidateQuery._id = { $ne: excludeCandidateId }
    const [existingCandidate, existingCmsCandidate] = await Promise.all([
      Candidate.findOne(candidateQuery).select('_id'),
      CmsCandidate.findOne(cmsQuery).select('_id')
    ])

    if (existingCandidate || existingCmsCandidate) {
      const error = new Error(`A candidate with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const findAdvisorByCode = async (code) =>
  User.findOne({
    role: 'businessAdvisor',
    advisorCode: code,
    isActive: true
  }).select('_id name advisorCode')

const findActiveSuperAdmin = async () =>
  User.findOne({
    role: 'superAdmin',
    isActive: true
  })
    .sort({ createdAt: 1 })
    .select('_id name email')

const resolveAdvisorDisplayName = async (advisor) => {
  const directName = String(advisor?.name || '').trim()
  if (directName) return directName

  const profile = await BusinessAdvisor.findOne({ userId: advisor?._id }).select('fullName').lean()
  const profileName = String(profile?.fullName || '').trim()
  if (profileName) return profileName

  return advisor?.email || advisor?.advisorCode || null
}

const invalidateReferenceCaches = () => {
  invalidateCache('/api/candidates').catch(() => {})
  invalidateCache('/api/students').catch(() => {})
}

const normalizeDocumentFieldName = (fieldName) =>
  String(fieldName || '').startsWith('documents.')
    ? String(fieldName || '').slice('documents.'.length)
    : String(fieldName || '')

const uploadApplicationDocuments = async (filesByField = {}) => {
  const documents = []

  for (const [fieldName, files] of Object.entries(filesByField || {})) {
    const documentType = normalizeDocumentFieldName(fieldName)
    if (!isCandidateDocumentKey(documentType)) continue

    for (const file of files || []) {
      try {
        validateUploadFile(file, {
          allowedMimeTypes: candidateDocumentAllowedMimeTypesByKey[documentType],
          allowedExtensions: candidateDocumentAllowedExtensionsByKey[documentType],
          typeMessage: 'File type is not allowed for this document',
          extensionMessage: 'File extension is not allowed for this document'
        })
      } catch (error) {
        const documentLabel = candidateDocumentLabelByKey[documentType] || 'Document'
        const fileName = file?.originalname || 'selected file'
        error.message = `${documentLabel} - ${fileName}: ${error.message}`
        throw error
      }
      const fileUrl = await uploadToS3(file, 'candidate-documents')
      documents.push({
        documentType,
        documentLabel: candidateDocumentLabelByKey[documentType],
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      })
    }
  }

  return documents
}

const getAdvisorByCode = async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase()
  const advisor = await findAdvisorByCode(code)

  if (!advisor) {
    return res.status(404).json({ message: 'Invalid advisor code' })
  }

  res.json({
    advisorId: advisor._id,
    advisorName: advisor.name,
    advisorCode: advisor.advisorCode
  })
}

const cmsCandidateFieldsFromPayload = (payload) => ({
  formMeta: payload.formMeta,
  fullName: payload.candidateName,
  collegeName: payload.collegeName,
  mobileNumber: payload.mobileNumber,
  aadhaarNo: payload.aadhaarNo,
  panNo: payload.panNo,
  whatsappNo: payload.whatsappNo,
  emailId: payload.emailId,
  dateOfBirth: payload.dateOfBirth,
  gender: payload.gender,
  currentAge: payload.currentAge,
  currentAddress: payload.currentAddress,
  permanentAddress: payload.permanentAddress,
  education: payload.education,
  yearOfHigherEducation: payload.yearOfHigherEducation,
  computerCourses: payload.computerCourses,
  otherAchievements: payload.otherAchievements,
  specialization: payload.interestedDepartment,
  totalExperience: payload.totalExperience,
  experienceDepartment: payload.experienceDepartment,
  currentCompany: payload.currentCompany,
  keyResponsibilities: payload.keyResponsibilities,
  careerSummary: payload.careerSummary,
  currentDesignation: payload.appliedFor || undefined,
  currentSalary: payload.currentSalary,
  expectedSalary: payload.expectedSalary,
  noticePeriod: payload.noticePeriod === undefined ? undefined : String(payload.noticePeriod),
  preferredLocation: payload.preferredJobLocation,
  marriageStatus: payload.marriageStatus,
  appliedFor: payload.appliedFor,
  interestedDepartment: payload.interestedDepartment,
  lookingForField: payload.lookingForField,
  preferredIndustry: payload.preferredIndustry,
  preferredJobLocation: payload.preferredJobLocation,
  availabilityForInterview: payload.availabilityForInterview,
  interviewMode: payload.interviewMode,
  reasonForJobChange: payload.reasonForJobChange,
  currentJobLocation: payload.currentJobLocation,
  currentJobLocationOther: payload.currentJobLocationOther,
  currentJobLocationMidcArea: payload.currentJobLocationMidcArea,
  currentJobLocationMidcAreaOther: payload.currentJobLocationMidcAreaOther,
  placementReference: payload.placementReference,
  familyDetails: payload.familyDetails,
  applicationDetails: payload.applicationDetails,
  publicApplyState: payload.publicApplyState,
  goalAim: payload.goalAim,
  feedback: payload.feedback,
  suggestion: payload.suggestion
})

const createCmsCandidate = async (payload, superAdmin, advisor, sourceCandidate = null, portalCredential = null) => {
  const advisorName = advisor ? await resolveAdvisorDisplayName(advisor) : null
  const candidateCode = await nextCandidateCode()
  const cmsCandidate = await CmsCandidate.create({
    candidateCode,
    sourceCandidateId: sourceCandidate?._id || null,
    ...cmsCandidateFieldsFromPayload(payload),
    documents: payload.documents || [],
    candidatePortal: portalCredential
      ? {
          passwordHash: portalCredential.passwordHash,
          password: portalCredential.password,
          lastUpdatedAt: new Date()
        }
      : undefined,
    source: 'public_form',
    intakeType: advisor ? 'advisor' : 'walkin',
    advisor: advisor?._id || null,
    advisorCode: advisor?.advisorCode,
    referenceName: advisorName,
    createdBy: superAdmin._id
  })

  await CmsRemark.updateOne(
    { candidateId: cmsCandidate._id },
    { $setOnInsert: { checkboxes: defaultCheckboxes() } },
    { upsert: true }
  )

  return cmsCandidate
}

const submitToAdvisorFlow = async (req, res, payload, advisor, superAdmin, portalCredential) => {
  const advisorName = await resolveAdvisorDisplayName(advisor)
  await Candidate.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  const student = await Candidate.create({
    ...payload,
    submittedBy: advisor._id,
    reference_type: 'ba',
    reference_name: advisorName,
    business_advisor_id: advisor._id,
    source: 'public_form',
    status: 'not_viewed',
    priorityOrder: 0
  })

  const cmsCandidate = await createCmsCandidate(payload, superAdmin, advisor, student, portalCredential)
  const candidateToken = signCandidatePortalToken(cmsCandidate)

  const io = req.app.get('io')
  const studentObject = student.toObject()
  if (io) {
    io.to('admin-board').emit('new_student', {
      ...studentObject,
      submittedBy: { _id: advisor._id, name: advisorName || advisor.name, advisorCode: advisor.advisorCode },
      source: 'public_form'
    })

    io.to(`ba-${advisor._id}`).emit('new_student_received', {
      studentId: student._id,
      candidateName: student.candidateName,
      source: 'public_form'
    })
  }

  invalidateReferenceCaches()

  return res.status(201).json({
    message: 'Application submitted successfully',
    studentId: student._id,
    cmsCandidateId: cmsCandidate._id,
    candidateCode: cmsCandidate.candidateCode || null,
    candidateToken,
    mode: 'advisor'
  })
}

const submitToCmsFlow = async (res, payload, superAdmin, portalCredential) => {
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for direct submission' })
  }

  const cmsCandidate = await createCmsCandidate(payload, superAdmin, null, null, portalCredential)
  const candidateToken = signCandidatePortalToken(cmsCandidate)

  return res.status(201).json({
    message: 'Application submitted to candidate management successfully',
    studentId: cmsCandidate._id,
    candidateCode: cmsCandidate.candidateCode || null,
    candidateToken,
    mode: 'cms'
  })
}

const submitApplication = async (req, res) => {
  const payload = normalizeApplicationPayload(req.body || {})
  const password = validateCandidatePassword(req.body?.candidatePassword, req.body?.candidatePasswordConfirm)
  const portalCredential = {
    passwordHash: await bcrypt.hash(password, 12),
    password
  }
  await ensureUniqueApplicationIdentity(payload)
  const superAdmin = await findActiveSuperAdmin()
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for candidate management submission' })
  }
  payload.documents = await uploadApplicationDocuments(req.files)

  const paramCode = String(req.params.code || '').trim().toLowerCase()
  const bodyCode = String(req.body?.advisorCode || '').trim().toLowerCase()
  const advisorCode = paramCode || bodyCode

  if (advisorCode) {
    const advisor = await findAdvisorByCode(advisorCode)
    if (advisor) {
      return submitToAdvisorFlow(req, res, payload, advisor, superAdmin, portalCredential)
    }
  }

  return submitToCmsFlow(res, payload, superAdmin, portalCredential)
}

const candidateSessionPayload = (candidate, token = null) => ({
  candidate: {
    id: candidate._id,
    candidateCode: candidate.candidateCode,
    fullName: candidate.fullName,
    mobileNumber: candidate.mobileNumber,
    publicApplyState: candidate.publicApplyState || {},
    documents: candidate.documents || [],
    updatedAt: candidate.updatedAt
  },
  ...(token ? { candidateToken: token } : {})
})

const loginCandidateApplication = async (req, res) => {
  const identifier = String(req.body?.candidateCode || req.body?.mobileNumber || '').trim()
  const password = String(req.body?.password || '')

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Mobile number or Candidate ID and password are required' })
  }

  // Determine lookup: 10-digit number → mobile, otherwise → candidateCode
  const isMobile = /^\d{10}$/.test(identifier)
  let candidate = null

  if (isMobile) {
    // Find the most recent CMS candidate with this mobile who has a portal password
    candidate = await CmsCandidate.findOne({ mobileNumber: identifier, 'candidatePortal.passwordHash': { $exists: true } })
      .sort({ createdAt: -1 })
      .select('+candidatePortal.passwordHash')
  } else {
    candidate = await CmsCandidate.findOne({ candidateCode: identifier.toUpperCase() }).select('+candidatePortal.passwordHash')
  }

  if (!candidate?.candidatePortal?.passwordHash) {
    return res.status(401).json({ message: 'Invalid credentials. Check your mobile number or Candidate ID and password.' })
  }

  const passwordMatches = await bcrypt.compare(password, candidate.candidatePortal.passwordHash)
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid credentials. Check your mobile number or Candidate ID and password.' })
  }

  candidate.candidatePortal.lastLoginAt = new Date()
  await candidate.save()

  const token = signCandidatePortalToken(candidate)
  res.json(candidateSessionPayload(candidate, token))
}

const getCandidateApplicationSession = async (req, res) => {
  const candidate = await verifyCandidatePortalToken(req)
  if (!candidate) {
    return res.status(401).json({ message: 'Candidate login required' })
  }

  res.json(candidateSessionPayload(candidate))
}

const updateCandidateApplication = async (req, res) => {
  const candidate = await verifyCandidatePortalToken(req)
  if (!candidate) {
    return res.status(401).json({ message: 'Candidate login required' })
  }

  const payload = normalizeApplicationPayload(req.body || {})
  await ensureUniqueApplicationIdentity(payload, candidate._id, candidate.sourceCandidateId)
  const uploadedDocuments = await uploadApplicationDocuments(req.files)

  Object.assign(candidate, cmsCandidateFieldsFromPayload(payload))
  if (uploadedDocuments.length) {
    candidate.documents = [...(candidate.documents || []), ...uploadedDocuments]
  }
  candidate.candidatePortal.lastUpdatedAt = new Date()
  await candidate.save()

  if (candidate.sourceCandidateId) {
    await Candidate.findByIdAndUpdate(candidate.sourceCandidateId, {
      ...payload,
      candidateName: payload.candidateName,
      documents: uploadedDocuments.length
        ? [...(candidate.documents || [])]
        : candidate.documents || []
    })
  }

  invalidateReferenceCaches()

  res.json({
    message: 'Application updated successfully',
    candidateCode: candidate.candidateCode,
    candidate: candidateSessionPayload(candidate).candidate
  })
}

const downloadSharedSuccessRemarkPdf = async (req, res) => {
  const shareToken = String(req.params.code || req.params.token || '').trim()
  let candidateId = null

  if (!shareToken) {
    return res.status(401).json({ message: 'Invalid or expired PDF link' })
  }

  if (shareToken.includes('.')) {
    let decoded
    try {
      decoded = jwt.verify(shareToken, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    } catch (_error) {
      return res.status(401).json({ message: 'Invalid or expired PDF link' })
    }

    if (decoded?.purpose !== pdfSharePurpose || !decoded?.candidateId) {
      return res.status(401).json({ message: 'Invalid PDF link' })
    }

    candidateId = decoded.candidateId
  } else {
    const share = await CmsPdfShare.findOne({
      tokenHash: hashPdfShareCode(shareToken),
      purpose: pdfSharePurpose,
      expiresAt: { $gt: new Date() }
    }).select('candidateId')

    if (!share) {
      return res.status(401).json({ message: 'Invalid or expired PDF link' })
    }

    candidateId = share.candidateId
  }

  const candidate = await CmsCandidate.findById(candidateId)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const buffer = generateSuccessRemarkPdf(candidate)
  const fileName = successRemarkPdfFileName(candidate).replace(/"/g, '')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Length', String(buffer.length))
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
  res.end(buffer)
}

module.exports = {
  getAdvisorByCode,
  submitApplication,
  loginCandidateApplication,
  getCandidateApplicationSession,
  updateCandidateApplication,
  downloadSharedSuccessRemarkPdf
}
