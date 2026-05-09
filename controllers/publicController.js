const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsRemark = require('../models/cms/CmsRemark')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const User = require('../models/User')
const { nextCandidateCode } = require('../utils/cmsCandidateCode')

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

const createCmsCandidate = async (payload, superAdmin, advisor) => {
  const advisorName = advisor ? await resolveAdvisorDisplayName(advisor) : null
  const candidateCode = await nextCandidateCode(new Date())
  const cmsCandidate = await CmsCandidate.create({
    candidateCode,
    fullName: payload.candidateName,
    mobileNumber: payload.mobileNumber,
    aadhaarNo: payload.aadhaarNo,
    whatsappNo: payload.whatsappNo,
    emailId: payload.emailId,
    education: payload.education,
    specialization: payload.interestedDepartment,
    totalExperience: payload.totalExperience,
    currentCompany: payload.currentCompany,
    careerSummary: payload.careerSummary,
    currentDesignation: payload.appliedFor || undefined,
    currentSalary: payload.currentSalary,
    expectedSalary: payload.expectedSalary,
    noticePeriod: payload.noticePeriod === undefined ? undefined : String(payload.noticePeriod),
    preferredLocation: payload.preferredJobLocation,
    marriageStatus: payload.marriageStatus,
    appliedFor: payload.appliedFor,
    interestedDepartment: payload.interestedDepartment,
    preferredIndustry: payload.preferredIndustry,
    preferredJobLocation: payload.preferredJobLocation,
    availabilityForInterview: payload.availabilityForInterview,
    reasonForJobChange: payload.reasonForJobChange,
    currentJobLocation: payload.currentJobLocation,
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

  const cmsCandidate = await createCmsCandidate(payload, superAdmin, advisor)

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

  return res.status(201).json({
    message: 'Application submitted successfully',
    studentId: student._id,
    cmsCandidateId: cmsCandidate._id,
    candidateCode: cmsCandidate.candidateCode || null,
    mode: 'advisor'
  })
}

const submitToCmsFlow = async (res, payload) => {
  const superAdmin = await findActiveSuperAdmin()
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
  const superAdmin = await findActiveSuperAdmin()
  if (!superAdmin) {
    return res.status(500).json({ message: 'No active super admin found for candidate management submission' })
  }

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

  return submitToCmsFlow(res, payload)
}

module.exports = { getAdvisorByCode, submitApplication }
