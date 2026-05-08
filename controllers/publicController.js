const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsRemark = require('../models/cms/CmsRemark')
const User = require('../models/User')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const parseOptionalNumber = (value) => {
  if (value === '' || value === undefined || value === null) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
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

  payload.candidateName = String(payload.candidateName || '').trim()
  payload.mobileNumber = toDigits(payload.mobileNumber)
  payload.whatsappNo = toDigits(payload.whatsappNo) || undefined
  payload.aadhaarNo = toDigits(payload.aadhaarNo) || undefined
  payload.emailId = normalizeEmail(payload.emailId) || undefined

  payload.totalExperience = parseOptionalNumber(payload.totalExperience)
  payload.noticePeriod = parseOptionalNumber(payload.noticePeriod)
  if (!['Married', 'Unmarried', 'Single'].includes(String(payload.marriageStatus || ''))) {
    payload.marriageStatus = undefined
  }

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

  if (payload.emailId && !emailRegex.test(payload.emailId)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  return payload
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

const submitToAdvisorFlow = async (req, res, payload, advisor) => {
  await Candidate.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  const student = await Candidate.create({
    ...payload,
    submittedBy: advisor._id,
    source: 'public_form',
    status: 'not_viewed',
    priorityOrder: 0
  })

  const io = req.app.get('io')
  const studentObject = student.toObject()
  if (io) {
    io.to('admin-board').emit('new_student', {
      ...studentObject,
      submittedBy: { _id: advisor._id, name: advisor.name, advisorCode: advisor.advisorCode },
      source: 'public_form'
    })

    io.to(`ba-${advisor._id}`).emit('new_student_received', {
      studentId: student._id,
      candidateName: student.candidateName,
      source: 'public_form'
    })
  }

  return res.status(201).json({
    message: 'Application submitted successfully',
    studentId: student._id,
    mode: 'advisor'
  })
}

const submitToCmsFlow = async (res, payload) => {
  const superAdmin = await findActiveSuperAdmin()
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for direct submission' })
  }

  const cmsCandidate = await CmsCandidate.create({
    fullName: payload.candidateName,
    mobileNumber: payload.mobileNumber,
    whatsappNo: payload.whatsappNo,
    emailId: payload.emailId,
    education: payload.education,
    specialization: payload.interestedDepartment,
    totalExperience: payload.totalExperience,
    currentCompany: payload.currentCompany,
    currentDesignation: payload.appliedFor || undefined,
    currentSalary: payload.currentSalary,
    expectedSalary: payload.expectedSalary,
    noticePeriod: payload.noticePeriod === undefined ? undefined : String(payload.noticePeriod),
    preferredLocation: payload.preferredJobLocation,
    marriageStatus: payload.marriageStatus,
    createdBy: superAdmin._id
  })

  await CmsRemark.updateOne(
    { candidateId: cmsCandidate._id },
    { $setOnInsert: { checkboxes: defaultCheckboxes() } },
    { upsert: true }
  )

  return res.status(201).json({
    message: 'Application submitted to candidate management successfully',
    studentId: cmsCandidate._id,
    mode: 'cms'
  })
}

const submitApplication = async (req, res) => {
  const payload = normalizeApplicationPayload(req.body || {})

  const paramCode = String(req.params.code || '').trim().toLowerCase()
  const bodyCode = String(req.body?.advisorCode || '').trim().toLowerCase()
  const advisorCode = paramCode || bodyCode

  if (advisorCode) {
    const advisor = await findAdvisorByCode(advisorCode)
    if (!advisor) {
      return res.status(404).json({ message: 'Invalid advisor code' })
    }

    return submitToAdvisorFlow(req, res, payload, advisor)
  }

  return submitToCmsFlow(res, payload)
}

module.exports = { getAdvisorByCode, submitApplication }
