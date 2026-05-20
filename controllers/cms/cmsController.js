const CmsCandidate = require('../../models/cms/CmsCandidate')
const CmsCompany = require('../../models/cms/CmsCompany')
const CmsInterview = require('../../models/cms/CmsInterview')
const CmsPdfShare = require('../../models/cms/CmsPdfShare')
const CmsRemark = require('../../models/cms/CmsRemark')
const Candidate = require('../../models/Candidate')
const Placement = require('../../models/Placement')
const User = require('../../models/User')
const mongoose = require('mongoose')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const ExcelJS = require('exceljs')
const { nextCandidateCode, nextCandidateCodes } = require('../../utils/cmsCandidateCode')
const { syncCandidateFromCms } = require('../../utils/candidateStatusSync')
const { uploadToS3, getObjectFromS3 } = require('../../utils/s3Upload')
const { validateUploadFile } = require('../../utils/fileValidation')
const { generateSuccessRemarkPdf, successRemarkPdfFileName } = require('../../utils/successRemarkPdf')
const {
  candidateDocumentAllowedExtensionsByKey,
  candidateDocumentAllowedMimeTypesByKey,
  candidateDocumentLabelByKey,
  isCandidateDocumentKey
} = require('../../utils/candidateDocuments')
const { invalidateCache } = require('../../src/utils/invalidateCache')

const interviewDocumentLabelByKey = {
  appointmentLetter: 'Appointment Letter',
  offerLetter: 'Offer Letter',
  interviewLetter: 'Interview Letter',
  confirmationLetter: 'Confirmation Letter'
}

const pdfSharePurpose = 'success-remark-pdf'
const pdfShareExpiryDays = 30
const pdfShareCodeBytes = 16
const createPdfShareCode = () =>
  crypto.randomBytes(pdfShareCodeBytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const hashPdfShareCode = (code) => crypto.createHash('sha256').update(String(code || '')).digest('hex')

const isInterviewDocumentKey = (key) =>
  Object.prototype.hasOwnProperty.call(interviewDocumentLabelByKey, key)

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

const successRemarkKeys = [
  'selected',
  'joined',
  'notSelected',
  'rejected',
  'resumeReady',
  'educationVerified',
  'experienceVerified',
  'skillsAssessed',
  'backgroundChecked',
  'referenceVerified',
  'documentsCollected',
  'salaryNegotiated',
  'offerAccepted',
  'joiningConfirmed'
]

const defaultCheckboxes = () =>
  remarkKeys.reduce((acc, key) => {
    acc[key] = { checked: false, updatedAt: null }
    return acc
  }, {})

const ensureRemark = async (candidateId) => {
  let remark = await CmsRemark.findOne({ candidateId })
  if (!remark) {
    remark = await CmsRemark.create({ candidateId, checkboxes: defaultCheckboxes() })
  }
  return remark
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const directorAssessmentKeys = [
  'classOfCandidate',
  'priorityOfCandidate',
  'counselingOfCandidate',
  'counselingMode'
]

const normalizeDirectorAssessmentForAccess = (assessment = {}) =>
  directorAssessmentKeys.reduce((acc, key) => {
    const value = assessment?.[key]
    acc[key] = Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : String(value || '').trim()
        ? [String(value).trim()]
        : []
    return acc
  }, {})

const hasDirectorAssessmentValues = (assessment) =>
  Object.values(normalizeDirectorAssessmentForAccess(assessment)).some((value) => value.length)

const hasDirectorAssessmentChanged = (candidate, payload) => {
  if (!Object.prototype.hasOwnProperty.call(payload?.interviewForm || {}, 'directorAssessment')) return false

  return (
    JSON.stringify(normalizeDirectorAssessmentForAccess(candidate?.interviewForm?.directorAssessment)) !==
    JSON.stringify(normalizeDirectorAssessmentForAccess(payload.interviewForm.directorAssessment))
  )
}

const hasDirectorAssessmentApproval = async (req) => {
  if (req.user?.role === 'superAdmin') return true

  const token =
    req.get('x-director-assessment-approval') ||
    req.body?.directorAssessmentApprovalToken ||
    ''

  if (!token) return false

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded?.purpose !== 'director-assessment-approval' || !decoded?.id) return false

    const approver = await User.findOne({
      _id: decoded.id,
      role: 'superAdmin',
      isActive: true
    }).select('_id tokenVersion')

    return Boolean(approver) && Number(decoded.tokenVersion ?? -1) === Number(approver.tokenVersion || 0)
  } catch (_error) {
    return false
  }
}

const requireDirectorAssessmentApproval = async (req, shouldRequire) => {
  if (!shouldRequire) return
  if (await hasDirectorAssessmentApproval(req)) return

  const error = new Error('Super admin password is required to change Director Assessment')
  error.statusCode = 403
  throw error
}

const requireCandidateDeleteApproval = async (req) => {
  if (await hasDirectorAssessmentApproval(req)) return

  const error = new Error('Super admin password approval is required to delete candidate')
  error.statusCode = 403
  throw error
}

const invalidateReferenceCaches = () => {
  invalidateCache('/api/candidates').catch(() => {})
  invalidateCache('/api/students').catch(() => {})
}

const normalizeCandidateIdentity = (payload) => {
  const normalizedMobile = toDigits(payload.mobileNumber)
  if (!normalizedMobile) {
    const error = new Error('Mobile number is required')
    error.statusCode = 400
    throw error
  }
  if (normalizedMobile.length !== 10) {
    const error = new Error('Mobile number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedWhatsapp = toDigits(payload.whatsappNo)
  if (payload.whatsappNo && normalizedWhatsapp.length !== 10) {
    const error = new Error('WhatsApp number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedAadhaar = toDigits(payload.aadhaarNo)
  if (payload.aadhaarNo && normalizedAadhaar.length !== 12) {
    const error = new Error('Aadhaar number must be 12 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedEmail = normalizeEmail(payload.emailId)
  if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  payload.mobileNumber = normalizedMobile
  payload.whatsappNo = normalizedWhatsapp || undefined
  payload.aadhaarNo = normalizedAadhaar || undefined
  payload.emailId = normalizedEmail || undefined
}

const ensureUniqueCandidateIdentity = async (payload) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const [existingCms, existingCandidate] = await Promise.all([
      CmsCandidate.findOne({ [check.field]: check.value }).select('_id'),
      Candidate.findOne({ [check.field]: check.value }).select('_id')
    ])

    if (existingCms || existingCandidate) {
      const error = new Error(`A candidate with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const normalizeCompanyIdentity = (payload) => {
  const normalizedMobile = toDigits(payload.mobileNo)
  if (payload.mobileNo && normalizedMobile.length !== 10) {
    const error = new Error('Mobile number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedEmail = normalizeEmail(payload.emailId)
  if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  payload.mobileNo = normalizedMobile || undefined
  payload.emailId = normalizedEmail || undefined
}

const ensureUniqueCmsCompanyIdentity = async (payload, excludeId) => {
  const checks = [
    { field: 'mobileNo', label: 'mobile number', value: payload.mobileNo },
    { field: 'emailId', label: 'email', value: payload.emailId }
  ].filter((item) => item.value)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await CmsCompany.findOne(query).select('_id')
    if (existing) {
      const error = new Error(`A company with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const createCandidate = async (req, res) => {
  normalizeCandidateIdentity(req.body)
  await ensureUniqueCandidateIdentity(req.body)
  await requireDirectorAssessmentApproval(
    req,
    hasDirectorAssessmentValues(req.body?.interviewForm?.directorAssessment)
  )

  const candidateCode = await nextCandidateCode()
  const candidate = await CmsCandidate.create({
    ...req.body,
    candidateCode,
    createdBy: req.user._id
  })
  await ensureRemark(candidate._id)
  res.status(201).json(candidate)
}

const importHeaderMap = {
  name: 'fullName',
  fullname: 'fullName',
  candidatename: 'fullName',
  studentname: 'fullName',
  number: 'mobileNumber',
  mobile: 'mobileNumber',
  mobilenumber: 'mobileNumber',
  phone: 'mobileNumber',
  phonenumber: 'mobileNumber',
  contactnumber: 'mobileNumber',
  email: 'emailId',
  emailid: 'emailId',
  emailaddress: 'emailId',
  qualification: 'education',
  education: 'education',
  highesteducation: 'education',
  college: 'collegeName',
  collegename: 'collegeName',
  institute: 'collegeName',
  institutename: 'collegeName',
  department: 'appliedFor',
  dept: 'appliedFor',
  jobrole: 'appliedFor',
  appliedfor: 'appliedFor',
  designation: 'currentDesignation',
  currentdesignation: 'currentDesignation',
  jobprofile: 'currentDesignation',
  currentjobprofile: 'currentDesignation',
  skills: 'keySkills',
  keyskills: 'keySkills',
  experience: 'totalExperience',
  totalexperience: 'totalExperience',
  location: 'preferredJobLocation',
  preferredlocation: 'preferredJobLocation',
  preferredjoblocation: 'preferredJobLocation',
  address: 'currentAddress',
  currentaddress: 'currentAddress',
  permanentaddress: 'permanentAddress',
  company: 'currentCompany',
  currentcompany: 'currentCompany',
  whatsapp: 'whatsappNo',
  whatsappnumber: 'whatsappNo',
  aadhaar: 'aadhaarNo',
  aadhaarnumber: 'aadhaarNo',
  aadhar: 'aadhaarNo',
  aadharnumber: 'aadhaarNo',
  pan: 'panNo',
  pannumber: 'panNo',
  dob: 'dateOfBirth',
  dateofbirth: 'dateOfBirth',
  gender: 'gender',
  age: 'currentAge',
  currentage: 'currentAge',
  maritalstatus: 'marriageStatus',
  marriagestatus: 'marriageStatus',
  expectedsalary: 'expectedSalary',
  expectedctc: 'expectedSalary',
  currentctc: 'currentSalary',
  currentsalary: 'currentSalary',
  ctc: 'currentSalary',
  salary: 'expectedSalary',
  lookingfor: 'lookingForField',
  lookingforfield: 'lookingForField',
  keyresponsibilities: 'keyResponsibilities',
  responsibilities: 'keyResponsibilities',
  currentjoblocation: 'currentJobLocation',
  lastjoblocation: 'currentJobLocation',
  passingyear: 'yearOfHigherEducation',
  computercourses: 'computerCourses',
  achievements: 'otherAchievements',
  otherachievements: 'otherAchievements',
  referredby: 'placementReference.referenceBy',
  referencecontact: 'placementReference.referenceContactNumber',
  professorname: 'placementReference.professorName',
  staffname: 'placementReference.professorName',
  tponame: 'placementReference.professorName',
  professorcontact: 'placementReference.professorContactNumber',
  staffcontact: 'placementReference.professorContactNumber',
  tpocontact: 'placementReference.professorContactNumber',
  fathername: 'familyDetails.fatherOrHusbandName',
  husbandname: 'familyDetails.fatherOrHusbandName',
  fathermobile: 'familyDetails.fatherMobileNumber',
  fathercontact: 'familyDetails.fatherMobileNumber',
  fatheroccupation: 'familyDetails.fatherOccupation',
  mothername: 'familyDetails.motherOrWifeName',
  wifename: 'familyDetails.motherOrWifeName',
  mothermobile: 'familyDetails.motherMobileNumber',
  mothercontact: 'familyDetails.motherMobileNumber',
  motheroccupation: 'familyDetails.motherOccupation'
}

const normalizeImportHeader = (value) =>
  String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')

const importFieldFromHeader = (header) => {
  const normalized = normalizeImportHeader(header)
  if (!normalized) return null
  if (importHeaderMap[normalized]) return importHeaderMap[normalized]

  if ((normalized.includes('professor') || normalized.includes('staff') || normalized.includes('tpo')) && normalized.includes('contact')) return 'placementReference.professorContactNumber'
  if ((normalized.includes('professor') || normalized.includes('staff') || normalized.includes('tpo')) && normalized.includes('name')) return 'placementReference.professorName'
  if (normalized.includes('reference') && normalized.includes('contact')) return 'placementReference.referenceContactNumber'
  if ((normalized.includes('reference') || normalized.includes('referred')) && normalized.includes('by')) return 'placementReference.referenceBy'
  if ((normalized.includes('father') || normalized.includes('husband')) && normalized.includes('contact')) return 'familyDetails.fatherMobileNumber'
  if ((normalized.includes('father') || normalized.includes('husband')) && normalized.includes('mobile')) return 'familyDetails.fatherMobileNumber'
  if ((normalized.includes('father') || normalized.includes('husband')) && normalized.includes('occupation')) return 'familyDetails.fatherOccupation'
  if ((normalized.includes('father') || normalized.includes('husband')) && normalized.includes('name')) return 'familyDetails.fatherOrHusbandName'
  if ((normalized.includes('mother') || normalized.includes('wife')) && normalized.includes('contact')) return 'familyDetails.motherMobileNumber'
  if ((normalized.includes('mother') || normalized.includes('wife')) && normalized.includes('mobile')) return 'familyDetails.motherMobileNumber'
  if ((normalized.includes('mother') || normalized.includes('wife')) && normalized.includes('occupation')) return 'familyDetails.motherOccupation'
  if ((normalized.includes('mother') || normalized.includes('wife')) && normalized.includes('name')) return 'familyDetails.motherOrWifeName'
  if (normalized.includes('email') || normalized.includes('mailid')) return 'emailId'
  if (normalized.includes('whatsapp')) return 'whatsappNo'
  if (normalized.includes('aadhaar') || normalized.includes('aadhar')) return 'aadhaarNo'
  if (normalized.includes('pan')) return 'panNo'
  if (normalized.includes('mobile') || normalized.includes('phone') || normalized.includes('contact') || normalized === 'number') return 'mobileNumber'
  if (normalized === 'name' || normalized.includes('candidate') || normalized.includes('student') || normalized.includes('applicant')) return 'fullName'
  if (normalized.includes('qualification') || normalized.includes('education')) return 'education'
  if (normalized.includes('expected') && (normalized.includes('salary') || normalized.includes('ctc'))) return 'expectedSalary'
  if (normalized.includes('current') && (normalized.includes('salary') || normalized.includes('ctc'))) return 'currentSalary'
  if (normalized.includes('salary')) return 'expectedSalary'
  if (normalized.includes('jobprofile')) return 'currentDesignation'
  if (normalized.includes('jobrole') || (normalized.includes('job') && normalized.includes('role')) || normalized === 'role' || normalized.includes('department') || normalized.includes('dept') || normalized.includes('epart')) return 'appliedFor'
  if (normalized.includes('skill')) return 'keySkills'
  if (normalized.includes('college') || normalized.includes('institute')) return 'collegeName'
  if (normalized.includes('permanent') && normalized.includes('address')) return 'permanentAddress'
  if (normalized.includes('address')) return 'currentAddress'
  if (normalized.includes('experience')) return 'totalExperience'
  if (normalized.includes('current') && normalized.includes('job') && normalized.includes('location')) return 'currentJobLocation'
  if (normalized.includes('location')) return 'preferredJobLocation'
  if (normalized.includes('company')) return 'currentCompany'
  if (normalized.includes('designation')) return 'currentDesignation'
  if (normalized.includes('lookingfor')) return 'lookingForField'
  if (normalized.includes('responsibilit')) return 'keyResponsibilities'
  if (normalized.includes('gender')) return 'gender'
  if (normalized.includes('dob') || normalized.includes('birth')) return 'dateOfBirth'
  if (normalized.includes('marital') || normalized.includes('marriage')) return 'marriageStatus'
  if (normalized.includes('age')) return 'currentAge'

  return null
}

const excelValue = (value) => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value !== 'object') return value
  if (value.text !== undefined) return value.text
  if (value.result !== undefined) return value.result
  if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('')
  return String(value)
}

const parseImportDate = (value) => {
  if (!value) return undefined
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const cleanImportCandidate = (payload) => {
  payload.fullName = String(payload.fullName || '').trim()
  payload.mobileNumber = toDigits(payload.mobileNumber)
  payload.whatsappNo = toDigits(payload.whatsappNo) || undefined
  payload.aadhaarNo = toDigits(payload.aadhaarNo) || undefined
  payload.emailId = normalizeEmail(payload.emailId) || undefined
  payload.panNo = String(payload.panNo || '').trim().toUpperCase() || undefined

  if (payload.mobileNumber && payload.mobileNumber.length !== 10) payload.mobileNumber = undefined
  if (payload.whatsappNo && payload.whatsappNo.length !== 10) payload.whatsappNo = undefined
  if (payload.aadhaarNo && payload.aadhaarNo.length !== 12) payload.aadhaarNo = undefined
  if (payload.emailId && !emailRegex.test(payload.emailId)) payload.emailId = undefined
  if (payload.dateOfBirth !== undefined) payload.dateOfBirth = parseImportDate(payload.dateOfBirth)
  if (payload.totalExperience !== undefined) {
    const parsed = Number(String(payload.totalExperience).replace(/,/g, ''))
    payload.totalExperience = Number.isFinite(parsed) ? parsed : undefined
  }
  if (payload.currentAge !== undefined) {
    const parsed = Number(String(payload.currentAge).replace(/,/g, ''))
    payload.currentAge = Number.isFinite(parsed) ? parsed : undefined
  }
  if (payload.keySkills !== undefined) {
    payload.keySkills = String(payload.keySkills).split(/[,;|]/).map((item) => item.trim()).filter(Boolean)
  }
  if (payload.appliedFor && !payload.interestedDepartment) payload.interestedDepartment = payload.appliedFor

  payload.source = 'admin_panel'
  payload.intakeType = 'admin'
}

const setImportField = (payload, field, value) => {
  const parts = field.split('.')
  let target = payload
  parts.slice(0, -1).forEach((part) => {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {}
    target = target[part]
  })
  target[parts[parts.length - 1]] = value
}

const findImportHeaderRow = (rows) => {
  let bestMatch = null
  rows.slice(0, 15).forEach((row, index) => {
    const mappedHeaders = row.values.map(importFieldFromHeader)
    const fields = new Set(mappedHeaders.filter(Boolean))
    const score =
      fields.size +
      (fields.has('fullName') ? 3 : 0) +
      (fields.has('mobileNumber') ? 2 : 0) +
      (fields.has('emailId') ? 2 : 0)

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        index,
        rowNumber: row.rowNumber,
        mappedHeaders,
        score
      }
    }
  })

  return bestMatch?.score > 0 ? bestMatch : null
}

const readImportCandidates = async (file) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(file.buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = []
    for (let index = 1; index <= row.cellCount; index += 1) {
      values.push(excelValue(row.getCell(index).value))
    }
    rows.push({ rowNumber: row.number, values })
  })

  if (rows.length < 2) return []

  const headerRow = findImportHeaderRow(rows)
  if (!headerRow) return []

  return rows.slice(headerRow.index + 1).map((row) => {
    const payload = {}
    headerRow.mappedHeaders.forEach((field, columnIndex) => {
      const value = row.values[columnIndex]
      if (!field || value === undefined || value === null || String(value).trim() === '') return
      setImportField(payload, field, value instanceof Date ? value : String(value).trim())
    })
    cleanImportCandidate(payload)
    return { rowNumber: row.rowNumber, payload }
  })
}

const importIdentityFields = [
  { field: 'mobileNumber', label: 'mobile number' },
  { field: 'emailId', label: 'email' },
  { field: 'aadhaarNo', label: 'aadhaar number' }
]

const findImportRowsToCreate = async (rows) => {
  const failedRows = []
  const rowsWithoutFileDuplicates = []
  const seenByField = importIdentityFields.reduce((acc, item) => {
    acc[item.field] = new Map()
    return acc
  }, {})
  const valuesByField = importIdentityFields.reduce((acc, item) => {
    acc[item.field] = new Set()
    return acc
  }, {})

  rows.forEach((row) => {
    const errors = []

    importIdentityFields.forEach(({ field, label }) => {
      const value = row.payload[field]
      if (!value) return

      const firstRow = seenByField[field].get(value)
      if (firstRow) {
        errors.push(`Duplicate ${label} in Excel file (same as row ${firstRow})`)
        return
      }

      seenByField[field].set(value, row.rowNumber)
      valuesByField[field].add(value)
    })

    if (errors.length) {
      failedRows.push({ row: row.rowNumber, name: row.payload.fullName, errors })
      return
    }

    rowsWithoutFileDuplicates.push(row)
  })

  const orFilters = importIdentityFields
    .map(({ field }) => {
      const values = Array.from(valuesByField[field])
      return values.length ? { [field]: { $in: values } } : null
    })
    .filter(Boolean)

  if (!orFilters.length) return { rowsToCreate: rowsWithoutFileDuplicates, failedRows }

  const [existingCmsCandidates, existingCandidates] = await Promise.all([
    CmsCandidate.find({ $or: orFilters }).select('mobileNumber emailId aadhaarNo').lean(),
    Candidate.find({ $or: orFilters }).select('mobileNumber emailId aadhaarNo').lean()
  ])

  const existingByField = importIdentityFields.reduce((acc, item) => {
    acc[item.field] = new Set()
    return acc
  }, {})

  ;[...existingCmsCandidates, ...existingCandidates].forEach((candidate) => {
    importIdentityFields.forEach(({ field }) => {
      if (candidate[field]) existingByField[field].add(candidate[field])
    })
  })

  const rowsToCreate = []
  rowsWithoutFileDuplicates.forEach((row) => {
    const errors = importIdentityFields
      .filter(({ field }) => row.payload[field] && existingByField[field].has(row.payload[field]))
      .map(({ label }) => `A candidate with this ${label} already exists`)

    if (errors.length) {
      failedRows.push({ row: row.rowNumber, name: row.payload.fullName, errors })
      return
    }

    rowsToCreate.push(row)
  })

  return { rowsToCreate, failedRows }
}

const allowedImportRootFields = new Set([
  'fullName',
  'collegeName',
  'mobileNumber',
  'aadhaarNo',
  'panNo',
  'whatsappNo',
  'emailId',
  'dateOfBirth',
  'gender',
  'currentAge',
  'currentAddress',
  'permanentAddress',
  'education',
  'yearOfHigherEducation',
  'computerCourses',
  'otherAchievements',
  'specialization',
  'totalExperience',
  'experienceDepartment',
  'currentCompany',
  'lookingForField',
  'keyResponsibilities',
  'careerSummary',
  'currentDesignation',
  'currentSalary',
  'expectedSalary',
  'noticePeriod',
  'keySkills',
  'preferredLocation',
  'marriageStatus',
  'languagesKnown',
  'appliedFor',
  'interestedDepartment',
  'preferredIndustry',
  'preferredJobLocation',
  'availabilityForInterview',
  'interviewMode',
  'reasonForJobChange',
  'currentJobLocation',
  'currentJobLocationOther',
  'currentJobLocationMidcArea',
  'currentJobLocationMidcAreaOther',
  'source',
  'intakeType'
])

const allowedImportNestedFields = {
  placementReference: new Set([
    'professorName',
    'professorContactNumber',
    'referenceBy',
    'referenceContactNumber'
  ]),
  familyDetails: new Set([
    'fatherOrHusbandName',
    'fatherOccupation',
    'fatherMobileNumber',
    'motherOrWifeName',
    'motherOccupation',
    'motherMobileNumber'
  ])
}

const sanitizeConfirmedImportPayload = (rawPayload = {}) => {
  const source = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) ? rawPayload : {}
  const payload = {}

  Object.entries(source).forEach(([key, value]) => {
    if (allowedImportRootFields.has(key)) {
      payload[key] = value
      return
    }

    const nestedFields = allowedImportNestedFields[key]
    if (!nestedFields || !value || typeof value !== 'object' || Array.isArray(value)) return

    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      if (!nestedFields.has(nestedKey)) return
      if (!payload[key]) payload[key] = {}
      payload[key][nestedKey] = nestedValue
    })
  })

  cleanImportCandidate(payload)
  return payload
}

const rowsFromConfirmedImport = (rawRows = []) =>
  (Array.isArray(rawRows) ? rawRows : []).slice(0, 1000).map((row, index) => {
    const source = row && typeof row === 'object' && !Array.isArray(row) ? row : {}
    return {
      rowNumber: Number.parseInt(String(source.rowNumber || source.row || index + 1), 10) || index + 1,
      payload: sanitizeConfirmedImportPayload(source.payload || source.candidate || source)
    }
  })

const createImportCandidatesFromRows = async (rows, userId) => {
  const createdCandidates = []
  const skippedRows = []
  const failedRows = []
  const namedRows = []
  let rowsBeingCreated = []

  for (const row of rows) {
    if (!row.payload.fullName) {
      skippedRows.push({ row: row.rowNumber, reason: 'Name is required' })
      continue
    }

    namedRows.push(row)
  }

  try {
    const checkedRows = await findImportRowsToCreate(namedRows)
    failedRows.push(...checkedRows.failedRows)
    rowsBeingCreated = checkedRows.rowsToCreate

    if (rowsBeingCreated.length) {
      const candidateCodes = await nextCandidateCodes(rowsBeingCreated.length)
      const candidatesToCreate = rowsBeingCreated.map((row, index) => ({
        ...row.payload,
        candidateCode: candidateCodes[index],
        createdBy: userId
      }))
      const insertedCandidates = await CmsCandidate.insertMany(candidatesToCreate)

      if (insertedCandidates.length) {
        await CmsRemark.insertMany(
          insertedCandidates.map((candidate) => ({
            candidateId: candidate._id,
            checkboxes: defaultCheckboxes()
          })),
          { ordered: false }
        )
      }

      createdCandidates.push(...insertedCandidates.map(withResolvedReference))
    }
  } catch (error) {
    const rowsToReport = rowsBeingCreated.length ? rowsBeingCreated : namedRows
    rowsToReport.forEach((row) => {
      failedRows.push({
        row: row.rowNumber,
        name: row.payload.fullName,
        errors: [error.message || 'Could not import row']
      })
    })
  }

  if (createdCandidates.length) invalidateReferenceCaches()

  return {
    totalRows: rows.length,
    createdCount: createdCandidates.length,
    skippedCount: skippedRows.length,
    failedCount: failedRows.length,
    candidates: createdCandidates,
    skippedRows,
    failedRows
  }
}

const readImportFileRows = async (file) => {
  try {
    return await readImportCandidates(file)
  } catch (_error) {
    const error = new Error('Could not read Excel file. Please upload a valid .xlsx file.')
    error.statusCode = 400
    throw error
  }
}

const previewImportCandidates = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Excel file is required' })

  const rows = await readImportFileRows(req.file)
  const skippedRows = []
  const namedRows = []

  rows.forEach((row) => {
    if (!row.payload.fullName) {
      skippedRows.push({ row: row.rowNumber, reason: 'Name is required' })
      return
    }

    namedRows.push(row)
  })

  const checkedRows = await findImportRowsToCreate(namedRows)
  const previewRows = checkedRows.rowsToCreate.map((row) => ({
    rowNumber: row.rowNumber,
    payload: row.payload
  }))

  res.json({
    totalRows: rows.length,
    importableCount: previewRows.length,
    skippedCount: skippedRows.length,
    failedCount: checkedRows.failedRows.length,
    previewRows,
    skippedRows,
    failedRows: checkedRows.failedRows
  })
}

const confirmImportCandidates = async (req, res) => {
  const rows = rowsFromConfirmedImport(req.body?.rows)
  if (!rows.length) return res.status(400).json({ message: 'No import rows selected' })

  const result = await createImportCandidatesFromRows(rows, req.user._id)
  res.json(result)
}

const importCandidates = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Excel file is required' })

  const rows = await readImportFileRows(req.file)
  const result = await createImportCandidatesFromRows(rows, req.user._id)
  res.json(result)
}

const withResolvedReference = (candidateDoc) => {
  const candidate = candidateDoc?.toObject ? candidateDoc.toObject() : candidateDoc
  if (!candidate) return candidate

  if (!candidate.referenceName && candidate.intakeType === 'advisor') {
    const advisorName =
      candidate.advisor?.name || candidate.advisor?.email || candidate.advisor?.advisorCode || null
    candidate.referenceName = advisorName
  }

  return candidate
}

const queryText = (value, maxLength = 120) => {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exactTextRegex = (value) => new RegExp(`^${escapeRegExp(value)}$`, 'i')
const uniqueSortedText = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => queryText(String(value || ''), 120)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
const selectedOptionText = (value, otherValue) => {
  const text = queryText(String(value || ''), 120)
  return text === 'Other' ? queryText(String(otherValue || ''), 120) : text
}
const highestEducationFromCandidate = (candidate = {}) => {
  const educationDetails = candidate.applicationDetails?.education || {}
  const explicitValue = [
    educationDetails.highestEducation,
    selectedOptionText(educationDetails.educationSector, educationDetails.educationSectorOther),
    selectedOptionText(candidate.educationSector, candidate.educationSectorOther)
  ]
    .map((value) => queryText(String(value || ''), 120))
    .find(Boolean)

  if (explicitValue) return explicitValue

  const education = queryText(String(candidate.education || ''), 500)
  const match = education.match(
    /Highest Education(?: Like Graduate, Post Graduate)?:\s*(.*?)(?:\s*(?:Passing Year of Education|Education Branch|Education Specialization):|$)/is
  )

  return queryText(String(match?.[1] || education), 120)
}
const highestEducationDetailRegex = (value) =>
  new RegExp(
    `Highest Education(?: Like Graduate, Post Graduate)?:\\s*${escapeRegExp(value)}(?:\\s*(?:Passing Year of Education|Education Branch|Education Specialization):|\\s*$)`,
    'i'
  )
const highestEducationFilterConditions = (value) => {
  const exact = exactTextRegex(value)
  return [
    { 'applicationDetails.education.highestEducation': exact },
    { 'applicationDetails.education.educationSector': exact },
    { 'applicationDetails.education.educationSectorOther': exact },
    { educationSector: exact },
    { educationSectorOther: exact },
    { education: exact },
    { education: highestEducationDetailRegex(value) }
  ]
}
const positiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

const dateRangeFromKey = (value) => {
  const key = queryText(value, 20)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const start = new Date(`${key}T00:00:00.000Z`)
  const end = new Date(`${key}T23:59:59.999Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start, end }
}

const addDateFilter = (query, value) => {
  const range = dateRangeFromKey(value)
  if (!range) return
  query.createdAt = { $gte: range.start, $lte: range.end }
}

const addDateRangeFilter = (query, fromValue, toValue) => {
  const fromRange = dateRangeFromKey(fromValue)
  const toRange = dateRangeFromKey(toValue)
  if (!fromRange && !toRange) return

  query.createdAt = {}
  if (fromRange) query.createdAt.$gte = fromRange.start
  if (toRange) query.createdAt.$lte = toRange.end
}

const createCompany = async (req, res) => {
  normalizeCompanyIdentity(req.body)
  await ensureUniqueCmsCompanyIdentity(req.body)

  const company = await CmsCompany.create({
    ...req.body,
    createdBy: req.user._id
  })

  res.status(201).json(company)
}

const listCandidates = async (req, res) => {
  const search = queryText(req.query.search)
  const candidateId = queryText(req.query.candidateId || req.query.id, 40)
  const jobRole = queryText(req.query.jobRole, 120)
  const gender = queryText(req.query.gender, 30)
  const education = queryText(req.query.education, 120)
  const marriageStatus = queryText(req.query.marriageStatus, 30)
  const tile = queryText(req.query.tile, 30)
  const useLegacyAll = req.query.all === 'true' || req.query.paginated === 'false'
  const page = positiveInt(req.query.page, 1, 100000)
  const pageSize = positiveInt(req.query.pageSize, 10, 100)

  const query = {}
  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i')
    query.$or = [
      { candidateCode: regex },
      { fullName: regex },
      { mobileNumber: regex },
      { emailId: regex },
      { keySkills: regex },
      { appliedFor: regex },
      { currentDesignation: regex },
      { education: regex },
      { gender: regex }
    ]
  }
  if (candidateId) {
    query.candidateCode = exactTextRegex(candidateId)
  }
  if (jobRole) {
    const regex = exactTextRegex(jobRole)
    query.$and = [...(query.$and || []), { $or: [{ appliedFor: regex }, { currentDesignation: regex }] }]
  }
  if (gender) {
    query.gender = gender
  }
  if (education) {
    query.$and = [...(query.$and || []), { $or: highestEducationFilterConditions(education) }]
  }
  if (marriageStatus) {
    query.marriageStatus = marriageStatus
  }
  if (req.query.date) {
    addDateFilter(query, req.query.date)
  } else {
    addDateRangeFilter(
      query,
      req.query.dateFrom || req.query.startDate || req.query.from,
      req.query.dateTo || req.query.endDate || req.query.to
    )
  }

  if (tile === 'today') {
    addDateFilter(query, new Date().toISOString().slice(0, 10))
  }
  if (tile === 'selected') {
    query['successRemarks.selected.checked'] = true
  }
  if (tile === 'interviews') {
    const interviewCandidateIds = await CmsInterview.distinct('candidateId')
    query._id = { $in: interviewCandidateIds }
  }

  if (useLegacyAll) {
    const candidates = await CmsCandidate.find(query)
      .populate('advisor', 'name email advisorCode')
      .sort({ createdAt: -1 })

    const candidateIds = candidates.map((candidate) => candidate._id)
    const interviews = candidateIds.length
      ? await CmsInterview.find({ candidateId: { $in: candidateIds } })
          .select(
            'candidateId candidateName companyName jobRole reference attendInterview interestedForJoin interviewDate selectionChances ratingForCompany notAttendRemark notInterestedReason replyFromCompany positiveFeedback negativeFeedback overallDiscussion note updatedBy remark result createdAt updatedAt'
          )
          .sort({ interviewDate: -1, createdAt: -1 })
      : []
    const interviewsByCandidate = interviews.reduce((acc, interview) => {
      const key = String(interview.candidateId)
      if (!acc.has(key)) acc.set(key, [])
      acc.get(key).push(interview)
      return acc
    }, new Map())

    return res.json(
      candidates.map((candidateDoc) => {
        const candidate = withResolvedReference(candidateDoc)
        candidate.interviews = interviewsByCandidate.get(String(candidate._id)) || []
        candidate.interviewCount = candidate.interviews.length
        return candidate
      })
    )
  }

  const skip = (page - 1) * pageSize
  const todayRange = dateRangeFromKey(new Date().toISOString().slice(0, 10))

  const [
    total,
    candidates,
    statsTotal,
    statsToday,
    statsSelected,
    interviewCandidateIdsForStats,
    candidateCodeOptions,
    appliedForOptions,
    currentDesignationOptions,
    genderOptions,
    educationOptionCandidates
  ] = await Promise.all([
    CmsCandidate.countDocuments(query),
    CmsCandidate.find(query)
      .populate('advisor', 'name email advisorCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    CmsCandidate.countDocuments(),
    todayRange ? CmsCandidate.countDocuments({ createdAt: { $gte: todayRange.start, $lte: todayRange.end } }) : 0,
    CmsCandidate.countDocuments({ 'successRemarks.selected.checked': true }),
    CmsInterview.distinct('candidateId'),
    CmsCandidate.distinct('candidateCode'),
    CmsCandidate.distinct('appliedFor'),
    CmsCandidate.distinct('currentDesignation'),
    CmsCandidate.distinct('gender'),
    CmsCandidate.find({})
      .select('education applicationDetails educationSector educationSectorOther')
      .lean()
  ])

  const candidateIds = candidates.map((candidate) => candidate._id)
  const interviewCounts = candidateIds.length
    ? await CmsInterview.aggregate([
        { $match: { candidateId: { $in: candidateIds } } },
        { $group: { _id: '$candidateId', count: { $sum: 1 } } }
      ])
    : []
  const interviewCountByCandidate = new Map(interviewCounts.map((item) => [String(item._id), item.count]))

  res.json({
    items: candidates.map((candidateDoc) => {
      const candidate = withResolvedReference(candidateDoc)
      candidate.interviews = []
      candidate.interviewCount = interviewCountByCandidate.get(String(candidate._id)) || 0
      return candidate
    }),
    page,
    pageSize,
    total,
    stats: {
      total: statsTotal,
      newToday: statsToday,
      selected: statsSelected,
      activeInterviews: interviewCandidateIdsForStats.length
    },
    filterOptions: {
      candidateIds: uniqueSortedText(candidateCodeOptions),
      jobRoles: uniqueSortedText([...(appliedForOptions || []), ...(currentDesignationOptions || [])]),
      genders: uniqueSortedText(genderOptions),
      educations: uniqueSortedText((educationOptionCandidates || []).map(highestEducationFromCandidate))
    }
  })
}

const listCompanies = async (req, res) => {
  const search = queryText(req.query.search)

  const query = {}
  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i')
    query.$or = [
      { companyName: regex },
      { companyAddress: regex },
      { contactPersonName: regex },
      { contactPersonDesignation: regex },
      { mobileNo: regex },
      { emailId: regex },
      { 'jobRequirements.jobProfile': regex },
      { 'jobRequirements.jobLocation': regex }
    ]
  }

  const companies = await CmsCompany.find(query).sort({ createdAt: -1 })
  res.json(companies)
}

const getCandidateById = async (req, res) => {
  const candidateDoc = await CmsCandidate.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('advisor', 'name email advisorCode')
  const candidate = withResolvedReference(candidateDoc)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const [interviews, remark] = await Promise.all([
    CmsInterview.find({ candidateId: candidate._id }).sort({ interviewDate: -1, createdAt: -1 }),
    ensureRemark(candidate._id)
  ])

  res.json({ candidate, interviews, remark })
}

const getCompanyById = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id).populate('createdBy', 'name email')

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  res.json({ company })
}

const updateCandidate = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  await requireDirectorAssessmentApproval(req, hasDirectorAssessmentChanged(candidate, req.body || {}))

  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (key !== '_id' && key !== 'createdBy' && key !== 'directorAssessmentApprovalToken') {
      candidate[key] = value
    }
  })

  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json(candidate)
}

const uploadCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Document image is required' })
  }

  const documentType = String(req.body?.documentType || '').trim()
  if (!isCandidateDocumentKey(documentType)) {
    return res.status(400).json({ message: 'Invalid document type' })
  }

  validateUploadFile(req.file, {
    allowedMimeTypes: candidateDocumentAllowedMimeTypesByKey[documentType],
    allowedExtensions: candidateDocumentAllowedExtensionsByKey[documentType],
    typeMessage: 'File type is not allowed for this document',
    extensionMessage: 'File extension is not allowed for this document'
  })
  const fileUrl = await uploadToS3(req.file, 'candidate-documents')
  candidate.documents = candidate.documents || []
  candidate.documents.push({
    documentType,
    documentLabel: candidateDocumentLabelByKey[documentType],
    fileName: req.file.originalname,
    fileUrl,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date()
  })

  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json({ candidate: withResolvedReference(candidate) })
}

const deleteCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const nextDocuments = (candidate.documents || []).filter((doc) => String(doc?._id) !== String(req.params.docId))
  if (nextDocuments.length === (candidate.documents || []).length) {
    return res.status(404).json({ message: 'Document not found' })
  }

  candidate.documents = nextDocuments
  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json({ candidate: withResolvedReference(candidate) })
}

const viewCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('documents')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const doc = (candidate.documents || []).find((item) => String(item?._id) === String(req.params.docId))
  if (!doc) {
    return res.status(404).json({ message: 'Document not found' })
  }

  const object = await getObjectFromS3(doc.fileUrl)
  const contentType = doc.mimeType || object?.ContentType || 'application/octet-stream'
  const contentLength = doc.size || object?.ContentLength
  const fileName = doc.fileName || 'document'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`)
  if (contentLength) {
    res.setHeader('Content-Length', String(contentLength))
  }

  const body = object?.Body
  if (!body) {
    return res.status(404).json({ message: 'Document stream not found' })
  }

  if (typeof body.pipe === 'function') {
    body.on('error', (error) => {
      res.destroy(error)
    })
    body.pipe(res)
    return
  }

  const chunks = []
  // Fallback for async iterable body.
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  res.end(Buffer.concat(chunks))
}

const sendSuccessRemarkPdf = (res, candidate, disposition = 'attachment') => {
  const buffer = generateSuccessRemarkPdf(candidate)
  const fileName = successRemarkPdfFileName(candidate).replace(/"/g, '')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Length', String(buffer.length))
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`)
  res.end(buffer)
}

const downloadSuccessRemarkPdf = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  sendSuccessRemarkPdf(res, candidate, 'attachment')
}

const createSuccessRemarkShareLink = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('_id')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const expiresAt = new Date(Date.now() + pdfShareExpiryDays * 24 * 60 * 60 * 1000)
  let shareCode = ''

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextCode = createPdfShareCode()

    try {
      await CmsPdfShare.create({
        tokenHash: hashPdfShareCode(nextCode),
        candidateId: candidate._id,
        purpose: pdfSharePurpose,
        createdBy: req.user?._id,
        expiresAt
      })
      shareCode = nextCode
      break
    } catch (error) {
      if (error?.code !== 11000 || attempt === 4) {
        throw error
      }
    }
  }

  if (!shareCode) {
    return res.status(500).json({ message: 'Could not create PDF link' })
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`

  res.json({
    url: `${baseUrl}/api/public/sr/${shareCode}.pdf`,
    expiresInDays: pdfShareExpiryDays
  })
}

const uploadInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Document file is required' })
  }

  const documentType = String(req.body?.documentType || '').trim()
  if (!isInterviewDocumentKey(documentType)) {
    return res.status(400).json({ message: 'Invalid interview document type' })
  }

  validateUploadFile(req.file)
  const fileUrl = await uploadToS3(req.file, 'interview-documents')
  interview.documents = interview.documents || []
  interview.documents.push({
    documentType,
    documentLabel: interviewDocumentLabelByKey[documentType],
    fileName: req.file.originalname,
    fileUrl,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date()
  })

  await interview.save()
  res.json({ interview })
}

const deleteInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const nextDocuments = (interview.documents || []).filter((doc) => String(doc?._id) !== String(req.params.docId))
  if (nextDocuments.length === (interview.documents || []).length) {
    return res.status(404).json({ message: 'Document not found' })
  }

  interview.documents = nextDocuments
  await interview.save()
  res.json({ interview })
}

const viewInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId).select('documents')
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const doc = (interview.documents || []).find((item) => String(item?._id) === String(req.params.docId))
  if (!doc) {
    return res.status(404).json({ message: 'Document not found' })
  }

  const object = await getObjectFromS3(doc.fileUrl)
  const contentType = doc.mimeType || object?.ContentType || 'application/octet-stream'
  const contentLength = doc.size || object?.ContentLength
  const fileName = doc.fileName || 'document'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`)
  if (contentLength) {
    res.setHeader('Content-Length', String(contentLength))
  }

  const body = object?.Body
  if (!body) {
    return res.status(404).json({ message: 'Document stream not found' })
  }

  if (typeof body.pipe === 'function') {
    body.on('error', (error) => {
      res.destroy(error)
    })
    body.pipe(res)
    return
  }

  const chunks = []
  // Fallback for async iterable body.
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  res.end(Buffer.concat(chunks))
}

const updateCompany = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (key !== '_id' && key !== 'createdBy') {
      company[key] = value
    }
  })

  normalizeCompanyIdentity(company)
  await ensureUniqueCmsCompanyIdentity(company, company._id)

  await company.save()
  res.json(company)
}

const deleteCandidate = async (req, res) => {
  await requireCandidateDeleteApproval(req)

  const candidate = await CmsCandidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const linkedCandidate = candidate.sourceCandidateId
    ? await Candidate.findById(candidate.sourceCandidateId).select('_id')
    : null

  await Promise.all([
    CmsInterview.deleteMany({ candidateId: candidate._id }),
    CmsRemark.deleteOne({ candidateId: candidate._id }),
    linkedCandidate
      ? Placement.deleteMany({
          $or: [{ candidateId: linkedCandidate._id }, { studentId: linkedCandidate._id }]
        })
      : Promise.resolve(),
    linkedCandidate ? linkedCandidate.deleteOne() : Promise.resolve(),
    candidate.deleteOne()
  ])

  invalidateReferenceCaches()
  invalidateCache('/api/placements').catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  res.json({ message: 'Candidate deleted' })
}

const bulkDeleteCandidates = async (req, res) => {
  await requireCandidateDeleteApproval(req)

  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const uniqueIds = [...new Set(ids)].filter((id) => mongoose.Types.ObjectId.isValid(id))

  if (uniqueIds.length === 0) {
    return res.status(400).json({ message: 'Select at least one candidate to delete' })
  }

  const candidates = await CmsCandidate.find({ _id: { $in: uniqueIds } }).select('_id sourceCandidateId')

  if (candidates.length === 0) {
    return res.status(404).json({ message: 'Candidates not found' })
  }

  const candidateIds = candidates.map((candidate) => candidate._id)
  const linkedCandidateIds = [
    ...new Set(candidates.map((candidate) => candidate.sourceCandidateId).filter(Boolean).map((id) => String(id)))
  ]

  await Promise.all([
    CmsInterview.deleteMany({ candidateId: { $in: candidateIds } }),
    CmsRemark.deleteMany({ candidateId: { $in: candidateIds } }),
    CmsPdfShare.deleteMany({ candidateId: { $in: candidateIds } }),
    linkedCandidateIds.length
      ? Placement.deleteMany({
          $or: [
            { candidateId: { $in: linkedCandidateIds } },
            { studentId: { $in: linkedCandidateIds } }
          ]
        })
      : Promise.resolve(),
    linkedCandidateIds.length ? Candidate.deleteMany({ _id: { $in: linkedCandidateIds } }) : Promise.resolve(),
    CmsCandidate.deleteMany({ _id: { $in: candidateIds } })
  ])

  invalidateReferenceCaches()
  invalidateCache('/api/placements').catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  res.json({ message: 'Candidates deleted', deletedCount: candidates.length })
}

const deleteCompany = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  await company.deleteOne()
  res.json({ message: 'Company deleted' })
}

const normalizeRatingForCompany = (value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.min(5, numeric))
}

const interviewPayloadFromBody = (body = {}, candidate = null) => ({
  candidateName: String(body.candidateName || candidate?.fullName || '').trim(),
  companyName: String(body.companyName || '').trim(),
  jobRole: String(body.jobRole || '').trim(),
  reference: String(body.reference || '').trim(),
  attendInterview: String(body.attendInterview || '').trim(),
  interestedForJoin: String(body.interestedForJoin || '').trim(),
  interviewDate: body.interviewDate || null,
  selectionChances: String(body.selectionChances || '').trim(),
  ratingForCompany: normalizeRatingForCompany(body.ratingForCompany),
  notAttendRemark: String(body.notAttendRemark || '').trim(),
  notInterestedReason: String(body.notInterestedReason || '').trim(),
  replyFromCompany: String(body.replyFromCompany || '').trim(),
  positiveFeedback: String(body.positiveFeedback || '').trim(),
  negativeFeedback: String(body.negativeFeedback || '').trim(),
  overallDiscussion: String(body.overallDiscussion || '').trim(),
  note: String(body.note || '').trim(),
  updatedBy: String(body.updatedBy || 'SJP HR').trim(),
  remark: String(body.remark || body.overallDiscussion || '').trim(),
  result: body.result || 'Pending'
})

const addInterview = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const interview = await CmsInterview.create({
    candidateId: req.params.id,
    ...interviewPayloadFromBody(req.body, candidate)
  })

  res.status(201).json(interview)
}

const listInterviews = async (req, res) => {
  const interviews = await CmsInterview.find({ candidateId: req.params.id }).sort({ interviewDate: -1, createdAt: -1 })
  res.json(interviews)
}

const updateInterview = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)

  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const patch = interviewPayloadFromBody(req.body)
  Object.entries(patch).forEach(([key, value]) => {
    interview[key] = value
  })

  await interview.save()
  res.json(interview)
}

const deleteInterview = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)

  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  await interview.deleteOne()
  res.json({ message: 'Interview deleted' })
}

const getRemarks = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('_id')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const remark = await ensureRemark(candidate._id)
  res.json(remark)
}

const updateRemarks = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const remark = await ensureRemark(candidate._id)
  const updates = req.body || {}
  const touched = {
    processRemarks: false,
    successRemarks: false
  }

  const applyUpdate = (key, checked) => {
    if (!successRemarkKeys.includes(key) && !remarkKeys.includes(key)) {
      return false
    }

    if (successRemarkKeys.includes(key)) {
      candidate.successRemarks = candidate.successRemarks || {}
      candidate.successRemarks[key] = { checked, updatedAt: new Date() }
      touched.successRemarks = true
    } else if (remarkKeys.includes(key)) {
      remark.checkboxes[key] = { checked, updatedAt: new Date() }
      touched.processRemarks = true
    }

    return true
  }

  if (typeof updates.checkboxKey === 'string') {
    if (typeof updates.checked !== 'boolean') {
      return res.status(400).json({ message: 'Invalid checkbox update payload' })
    }

    const ok = applyUpdate(updates.checkboxKey, updates.checked)
    if (!ok) {
      return res.status(400).json({ message: 'Invalid checkbox key' })
    }
  } else {
    const keys = Object.keys(updates).filter((key) => typeof updates[key] === 'boolean')
    if (!keys.length) {
      return res.status(400).json({ message: 'No valid checkbox keys provided' })
    }

    let applied = false
    keys.forEach((key) => {
      applied = applyUpdate(key, updates[key]) || applied
    })

    if (!applied) {
      return res.status(400).json({ message: 'No valid checkbox keys provided' })
    }
  }

  await Promise.all([touched.processRemarks ? remark.save() : Promise.resolve(), touched.successRemarks ? candidate.save() : Promise.resolve()])
  if (touched.successRemarks) {
    await syncCandidateFromCms(candidate)
    invalidateReferenceCaches()
  }

  res.json({
    remark,
    successRemarks: candidate.successRemarks || {}
  })
}

module.exports = {
  createCandidate,
  importCandidates,
  previewImportCandidates,
  confirmImportCandidates,
  createCompany,
  listCandidates,
  listCompanies,
  getCandidateById,
  getCompanyById,
  updateCandidate,
  uploadCandidateDocument,
  deleteCandidateDocument,
  viewCandidateDocument,
  downloadSuccessRemarkPdf,
  createSuccessRemarkShareLink,
  uploadInterviewDocument,
  deleteInterviewDocument,
  viewInterviewDocument,
  updateCompany,
  deleteCandidate,
  bulkDeleteCandidates,
  deleteCompany,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
}
