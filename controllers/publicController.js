const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsPdfShare = require('../models/cms/CmsPdfShare')
const CmsRemark = require('../models/cms/CmsRemark')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const User = require('../models/User')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
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
  payload.familyDetails = {
    fatherOrHusbandName: text(payload.fatherOrHusbandName || payload.familyDetails?.fatherOrHusbandName),
    fatherOccupation: text(payload.fatherOccupation || payload.familyDetails?.fatherOccupation),
    fatherMobileNumber: toDigits(payload.fatherMobileNumber || payload.familyDetails?.fatherMobileNumber) || undefined,
    motherOrWifeName: text(payload.motherOrWifeName || payload.familyDetails?.motherOrWifeName),
    motherOccupation: text(payload.motherOccupation || payload.familyDetails?.motherOccupation),
    motherMobileNumber: toDigits(payload.motherMobileNumber || payload.familyDetails?.motherMobileNumber) || undefined,
    siblingName: text(payload.siblingName || payload.familyDetails?.siblingName),
    siblingEducation: text(payload.siblingEducation || payload.familyDetails?.siblingEducation || payload.siblingEducationOccupation || payload.familyDetails?.siblingEducationOccupation),
    siblingMobileNumber: toDigits(payload.siblingMobileNumber || payload.familyDetails?.siblingMobileNumber) || undefined,
    siblingDateOfBirth: payload.siblingDateOfBirth || payload.familyDetails?.siblingDateOfBirth || undefined,
    siblingAge: parseOptionalNumber(payload.siblingAge || payload.familyDetails?.siblingAge),
    siblingGender: pickOption(payload.siblingGender || payload.familyDetails?.siblingGender, ['Male', 'Female', 'Other']),
    siblingStudyStandard: text(payload.siblingStudyStandard || payload.familyDetails?.siblingStudyStandard),
    siblingStudyStandardOther: text(payload.siblingStudyStandardOther || payload.familyDetails?.siblingStudyStandardOther),
    siblingCareerProfile: text(payload.siblingCareerProfile || payload.familyDetails?.siblingCareerProfile),
    siblingCareerProfileOther: text(payload.siblingCareerProfileOther || payload.familyDetails?.siblingCareerProfileOther),
    brotherOccupation: text(payload.familyDetails?.brotherOccupation),
    sisterOccupation: text(payload.familyDetails?.sisterOccupation)
  }
  payload.goalAim = text(payload.goalAim)
  payload.feedback = text(payload.feedback)
  payload.suggestion = text(payload.suggestion)
  payload.marriageStatus = pickOption(payload.marriageStatus, ['Married', 'Unmarried', 'Single', 'Widow'])
  payload.applicationDetails = parseApplicationDetails(payload.applicationDetails)

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
    [payload.familyDetails.siblingMobileNumber, 'Sibling mobile number']
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

const ensureUniqueApplicationIdentity = async (payload) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo },
    { field: 'panNo', label: 'PAN number', value: payload.panNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const [existingCandidate, existingCmsCandidate] = await Promise.all([
      Candidate.findOne({ [check.field]: check.value }).select('_id'),
      CmsCandidate.findOne({ [check.field]: check.value }).select('_id')
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

const findAdvisorById = async (id) =>
  User.findOne({
    _id: id,
    role: 'businessAdvisor',
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
      validateUploadFile(file, {
        allowedMimeTypes: candidateDocumentAllowedMimeTypesByKey[documentType],
        allowedExtensions: candidateDocumentAllowedExtensionsByKey[documentType],
        typeMessage: 'File type is not allowed for this document',
        extensionMessage: 'File extension is not allowed for this document'
      })
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

  if (code === 'all') {
    const advisors = await User.find({
      role: 'businessAdvisor',
      isActive: true
    })
      .sort({ name: 1 })
      .select('_id name advisorCode')

    return res.json(
      advisors.map((advisor) => ({
        advisorId: advisor._id,
        advisorName: advisor.name,
        advisorCode: advisor.advisorCode
      }))
    )
  }

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

const createCmsCandidate = async (payload, superAdmin, advisor, sourceCandidate = null) => {
  const advisorName = advisor ? await resolveAdvisorDisplayName(advisor) : null
  const candidateCode = await nextCandidateCode()
  const cmsCandidate = await CmsCandidate.create({
    candidateCode,
    sourceCandidateId: sourceCandidate?._id || null,
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
    goalAim: payload.goalAim,
    feedback: payload.feedback,
    suggestion: payload.suggestion,
    documents: payload.documents || [],
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

const submitToAdvisorFlow = async (req, res, payload, advisor, superAdmin) => {
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

  const cmsCandidate = await createCmsCandidate(payload, superAdmin, advisor, student)

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
    mode: 'advisor'
  })
}

const submitToCmsFlow = async (res, payload, superAdmin) => {
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for direct submission' })
  }

  const cmsCandidate = await createCmsCandidate(payload, superAdmin, null)

  return res.status(201).json({
    message: 'Application submitted to candidate management successfully',
    studentId: cmsCandidate._id,
    candidateCode: cmsCandidate.candidateCode || null,
    mode: 'cms'
  })
}

const submitApplication = async (req, res) => {
  const payload = normalizeApplicationPayload(req.body || {})
  await ensureUniqueApplicationIdentity(payload)
  const superAdmin = await findActiveSuperAdmin()
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for candidate management submission' })
  }
  payload.documents = await uploadApplicationDocuments(req.files)

  const paramCode = String(req.params.code || '').trim().toLowerCase()
  const bodyCode = String(req.body?.advisorCode || '').trim().toLowerCase()
  const advisorCode = paramCode || bodyCode
  const advisorId = String(req.body?.business_advisor_id || '').trim()

  if (advisorCode || advisorId) {
    const advisor = advisorId ? await findAdvisorById(advisorId) : await findAdvisorByCode(advisorCode)
    if (advisor) {
      return submitToAdvisorFlow(req, res, payload, advisor, superAdmin)
    }
  }

  return submitToCmsFlow(res, payload, superAdmin)
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

module.exports = { getAdvisorByCode, submitApplication, downloadSharedSuccessRemarkPdf }
