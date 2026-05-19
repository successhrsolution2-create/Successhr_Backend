const Candidate = require('../models/Candidate')
const Placement = require('../models/Placement')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsInterview = require('../models/cms/CmsInterview')
const CmsRemark = require('../models/cms/CmsRemark')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const { nextCandidateCode } = require('../utils/cmsCandidateCode')
const { syncCmsFromCandidate } = require('../utils/candidateStatusSync')
const { emitToAdmin, emitToBA } = require('../socket')
const { uploadToS3 } = require('../utils/s3Upload')
const { validateUploadFile } = require('../utils/fileValidation')
const { invalidateCache } = require('../src/utils/invalidateCache')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emitCandidateEvent = (adminEvent, baEvent, baId, payload) => {
  emitToAdmin(adminEvent, payload)
  emitToBA(baId, baEvent, payload)
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

const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

const candidateIdentityChecks = (payload) =>
  [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo }
  ].filter((item) => item.value)

const candidateConflict = (message) => {
  const error = new Error(message)
  error.statusCode = 409
  return error
}

const invalidateCandidateCaches = () =>
  Promise.all([
    invalidateCache('/api/candidates').catch(() => 0),
    invalidateCache('/api/students').catch(() => 0)
  ])

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

const ensureUniqueCandidateIdentity = async (payload, excludeId, options = {}) => {
  const checkCms = options.checkCms ?? !excludeId
  const checks = candidateIdentityChecks(payload)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await Candidate.findOne(query).select('_id')
    if (existing) {
      throw candidateConflict(`A candidate with this ${check.label} already exists`)
    }

    if (checkCms) {
      const cmsQuery = { [check.field]: check.value }
      const existingCms = await CmsCandidate.findOne(cmsQuery).select('_id candidateCode fullName')
      if (existingCms) {
        throw candidateConflict(`A candidate with this ${check.label} already exists`)
      }
    }
  }
}

const findClaimableCmsCandidate = async (payload, advisorId) => {
  const matches = new Map()

  for (const check of candidateIdentityChecks(payload)) {
    const existingCms = await CmsCandidate.findOne({ [check.field]: check.value }).select(
      '_id candidateCode source sourceCandidateId advisor mobileNumber emailId aadhaarNo createdBy'
    )

    if (existingCms) {
      const key = existingCms._id.toString()
      const match = matches.get(key) || { cmsCandidate: existingCms, labels: [] }
      match.labels.push(check.label)
      matches.set(key, match)
    }
  }

  if (!matches.size) return null

  if (matches.size > 1) {
    throw candidateConflict(
      'These candidate details match multiple candidate management records. Please update the existing records before submitting this reference.'
    )
  }

  const [{ cmsCandidate, labels }] = [...matches.values()]

  if (cmsCandidate.sourceCandidateId) {
    const linkedCandidate = await Candidate.findById(cmsCandidate.sourceCandidateId).select('_id')
    if (linkedCandidate) {
      throw candidateConflict(`A candidate with this ${labels[0]} already exists`)
    }
  }

  if (cmsCandidate.advisor && cmsCandidate.advisor.toString() !== advisorId.toString()) {
    throw candidateConflict('This candidate management record is already assigned to another business advisor')
  }

  return cmsCandidate
}

const populateCandidate = (query) => query.populate('submittedBy', 'name email')

const canAccess = (req, candidate) => {
  const ownerId = candidate.submittedBy?._id || candidate.submittedBy
  return req.user.role === 'superAdmin' || ownerId.toString() === req.user._id.toString()
}

const ownerUserId = (candidate) => candidate?.submittedBy?._id || candidate?.submittedBy

const resolveAdvisorDisplayName = async (advisor) => {
  const directName = String(advisor?.name || '').trim()
  if (directName) return directName

  const profile = await BusinessAdvisor.findOne({ userId: advisor?._id }).select('fullName').lean()
  const profileName = String(profile?.fullName || '').trim()
  if (profileName) return profileName

  return advisor?.email || advisor?.advisorCode || null
}

const buildCmsCandidatePayload = async (candidate, advisor) => {
  const advisorName = await resolveAdvisorDisplayName(advisor)

  return {
    sourceCandidateId: candidate._id,
    formMeta: candidate.formMeta,
    fullName: candidate.candidateName,
    collegeName: candidate.collegeName,
    mobileNumber: candidate.mobileNumber,
    aadhaarNo: candidate.aadhaarNo,
    panNo: candidate.panNo,
    whatsappNo: candidate.whatsappNo,
    emailId: candidate.emailId,
    gender: candidate.gender,
    currentAge: candidate.currentAge,
    currentAddress: candidate.currentAddress,
    permanentAddress: candidate.permanentAddress,
    education: candidate.education,
    yearOfHigherEducation: candidate.yearOfHigherEducation,
    computerCourses: candidate.computerCourses,
    otherAchievements: candidate.otherAchievements,
    specialization: candidate.interestedDepartment,
    totalExperience: candidate.totalExperience,
    experienceDepartment: candidate.experienceDepartment,
    currentCompany: candidate.currentCompany,
    lookingForField: candidate.lookingForField,
    keyResponsibilities: candidate.keyResponsibilities,
    careerSummary: candidate.careerSummary,
    currentDesignation: candidate.appliedFor || undefined,
    currentSalary: candidate.currentSalary,
    expectedSalary: candidate.expectedSalary,
    noticePeriod: candidate.noticePeriod === undefined ? undefined : String(candidate.noticePeriod),
    preferredLocation: candidate.preferredJobLocation,
    marriageStatus: candidate.marriageStatus,
    appliedFor: candidate.appliedFor,
    interestedDepartment: candidate.interestedDepartment,
    preferredIndustry: candidate.preferredIndustry,
    preferredJobLocation: candidate.preferredJobLocation,
    availabilityForInterview: candidate.availabilityForInterview,
    reasonForJobChange: candidate.reasonForJobChange,
    currentJobLocation: candidate.currentJobLocation,
    placementReference: candidate.placementReference,
    familyDetails: candidate.familyDetails,
    goalAim: candidate.goalAim,
    feedback: candidate.feedback,
    suggestion: candidate.suggestion,
    documents: candidate.documents || [],
    source: candidate.source || 'admin_panel',
    intakeType: 'advisor',
    advisor: advisor?._id || candidate.submittedBy,
    advisorCode: advisor?.advisorCode,
    referenceName: advisorName || candidate.reference_name || null,
    createdBy: advisor?._id || candidate.submittedBy
  }
}

const ensureCmsRemark = async (candidateId) => {
  await CmsRemark.updateOne(
    { candidateId },
    { $setOnInsert: { checkboxes: defaultCheckboxes() } },
    { upsert: true }
  )
}

const mirrorCandidateToCms = async (candidate, advisor, existingCmsCandidate = null) => {
  const payload = await buildCmsCandidatePayload(candidate, advisor)

  if (existingCmsCandidate) {
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && key !== 'createdBy' && key !== 'source') {
        existingCmsCandidate[key] = value
      }
    })

    if (!existingCmsCandidate.source) {
      existingCmsCandidate.source = payload.source
    }
    if (!existingCmsCandidate.createdBy) {
      existingCmsCandidate.createdBy = payload.createdBy
    }
    if (!existingCmsCandidate.candidateCode) {
      existingCmsCandidate.candidateCode = await nextCandidateCode()
    }

    await existingCmsCandidate.save()
    await ensureCmsRemark(existingCmsCandidate._id)
    return existingCmsCandidate
  }

  const candidateCode = await nextCandidateCode()
  const cmsCandidate = await CmsCandidate.create({
    candidateCode,
    ...payload
  })

  await ensureCmsRemark(cmsCandidate._id)

  return cmsCandidate
}

const getCandidates = async (req, res) => {
  const query = req.user.role === 'superAdmin' ? {} : { submittedBy: req.user._id }
  const candidates = await Candidate.find(query)
    .populate('submittedBy', 'name email')
    .sort({ status: 1, priorityOrder: 1, createdAt: -1 })

  res.json(candidates)
}

const createCandidate = async (req, res) => {
  normalizeCandidateIdentity(req.body)
  await ensureUniqueCandidateIdentity(req.body, null, { checkCms: false })
  const existingCmsCandidate = await findClaimableCmsCandidate(req.body, req.user._id)

  await Candidate.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  const advisorName = await resolveAdvisorDisplayName(req.user)

  let candidate = await Candidate.create({
    ...req.body,
    submittedBy: req.user._id,
    reference_type: 'ba',
    reference_name: advisorName,
    business_advisor_id: req.user._id,
    source: 'admin_panel',
    status: 'not_viewed',
    priorityOrder: 0
  })

  candidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
  await mirrorCandidateToCms(candidate, req.user, existingCmsCandidate)
  await invalidateCandidateCaches()

  emitCandidateEvent('new_candidate', 'candidate_updated', ownerUserId(candidate), candidate)
  emitCandidateEvent('new_student', 'student_updated', ownerUserId(candidate), candidate)

  res.status(201).json(candidate)
}

const getCandidateById = async (req, res) => {
  const candidate = await populateCandidate(Candidate.findById(req.params.id))

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  if (!canAccess(req, candidate)) {
    return res.status(403).json({ message: 'You can only access your own references' })
  }

  res.json(candidate)
}

const updateCandidate = async (req, res) => {
  const candidate = await Candidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  if (!canAccess(req, candidate)) {
    return res.status(403).json({ message: 'You can only update your own references' })
  }

  const blocked = ['submittedBy', '_id', 'source']
  if (req.user.role === 'businessAdvisor') {
    blocked.push('priorityOrder', 'status', 'adminNotes', 'selectionStatus')
  }

  const blockedFieldsSent = Object.keys(req.body || {}).filter((key) => blocked.includes(key))
  if (blockedFieldsSent.length) {
    return res.status(400).json({
      message: `You cannot update these fields: ${blockedFieldsSent.join(', ')}`
    })
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (!blocked.includes(key)) {
      candidate[key] = value
    }
  })

  normalizeCandidateIdentity(candidate)
  await ensureUniqueCandidateIdentity(candidate, candidate._id)

  await candidate.save()
  const savedCandidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
  await syncCmsFromCandidate(savedCandidate)
  await invalidateCandidateCaches()

  emitCandidateEvent('candidate_updated', 'candidate_updated', ownerUserId(savedCandidate), savedCandidate)
  emitCandidateEvent('student_updated', 'student_updated', ownerUserId(savedCandidate), savedCandidate)

  res.json(savedCandidate)
}

const deleteCandidate = async (req, res) => {
  const candidate = await Candidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  const ownerId = ownerUserId(candidate)
  const deletedId = candidate._id.toString()
  const linkedPlacements = await Placement.find({
    $or: [{ candidateId: candidate._id }, { studentId: candidate._id }]
  }).select('_id baId')

  if (linkedPlacements.length) {
    await Placement.deleteMany({ _id: { $in: linkedPlacements.map((placement) => placement._id) } })
  }

  const linkedCmsCandidate = await CmsCandidate.findOne({ sourceCandidateId: candidate._id }).select('_id')
  if (linkedCmsCandidate) {
    await Promise.all([
      CmsInterview.deleteMany({ candidateId: linkedCmsCandidate._id }),
      CmsRemark.deleteOne({ candidateId: linkedCmsCandidate._id }),
      linkedCmsCandidate.deleteOne()
    ])
  }

  await candidate.deleteOne()

  await Promise.all([
    invalidateCandidateCaches(),
    invalidateCache('/api/placements').catch(() => 0),
    invalidateCache('/api/placements/summary').catch(() => 0)
  ])

  emitCandidateEvent('candidate_deleted', 'candidate_deleted', ownerId, { id: deletedId })
  emitCandidateEvent('student_deleted', 'student_deleted', ownerId, { id: deletedId })
  linkedPlacements.forEach((placement) => {
    const payload = {
      id: placement._id.toString(),
      candidateId: deletedId
    }
    emitToAdmin('placement_deleted', { ...payload, studentId: deletedId })
    emitToBA(placement.baId, 'placement_deleted', { ...payload, studentId: deletedId })
  })

  res.json({ message: 'Candidate reference deleted' })
}

const uploadCandidateDocuments = async (req, res) => {
  const candidate = await Candidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  if (!canAccess(req, candidate)) {
    return res.status(403).json({ message: 'You can only upload documents for your own references' })
  }

  const files = req.files?.length ? req.files : req.file ? [req.file] : []

  if (files.length === 0) {
    return res.status(400).json({ message: 'At least one file is required' })
  }

  for (const file of files) {
    validateUploadFile(file)
    const fileUrl = await uploadToS3(file, 'candidate-documents')
    candidate.documents.push({
      fileName: file.originalname,
      fileUrl,
      uploadedAt: new Date()
    })
  }

  await candidate.save()
  const savedCandidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
  await syncCmsFromCandidate(savedCandidate)
  await invalidateCandidateCaches()

  emitCandidateEvent('candidate_updated', 'candidate_updated', ownerUserId(savedCandidate), savedCandidate)
  emitCandidateEvent('student_updated', 'student_updated', ownerUserId(savedCandidate), savedCandidate)

  res.json(savedCandidate)
}

const deleteCandidateDocument = async (req, res) => {
  const candidate = await Candidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  const nextDocs = (candidate.documents || []).filter((doc) => doc._id.toString() !== req.params.docId)
  if (nextDocs.length === (candidate.documents || []).length) {
    return res.status(404).json({ message: 'Document not found' })
  }

  candidate.documents = nextDocs
  await candidate.save()

  const savedCandidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
  await syncCmsFromCandidate(savedCandidate)
  await invalidateCandidateCaches()

  emitCandidateEvent('candidate_updated', 'candidate_updated', ownerUserId(savedCandidate), savedCandidate)
  emitCandidateEvent('student_updated', 'student_updated', ownerUserId(savedCandidate), savedCandidate)

  res.json(savedCandidate)
}

const updateCandidateStatus = async (req, res) => {
  const { status, adminNotes, advisorCommission = {} } = req.body
  const candidate = await Candidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  const statusChanged = status && status !== candidate.status

  if (status) {
    if (!Candidate.statusValues.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    if (statusChanged) {
      await Candidate.updateMany({ status }, { $inc: { priorityOrder: 1 } })
      candidate.priorityOrder = 0
    }

    candidate.status = status
  }

  if (adminNotes !== undefined) {
    candidate.adminNotes = adminNotes
  }

  const hasCommissionUpdate =
    advisorCommission.salary !== undefined ||
    advisorCommission.percentage !== undefined ||
    advisorCommission.paymentStatus !== undefined

  if (hasCommissionUpdate) {
    const salary = parseNumber(advisorCommission.salary)
    const percentage = parseNumber(advisorCommission.percentage)
    const paymentStatus = advisorCommission.paymentStatus

    if (Number.isNaN(salary) || salary < 0) {
      return res.status(400).json({ message: 'Salary must be a valid non-negative number' })
    }

    if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
      return res.status(400).json({ message: 'Advisor percentage must be between 0 and 100' })
    }

    if (paymentStatus && !['pending', 'paid'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status' })
    }

    const currentCommission = candidate.advisorCommission || {}
    const nextSalary = salary === undefined ? Number(currentCommission.salary || 0) : salary
    const nextPercentage = percentage === undefined ? Number(currentCommission.percentage || 0) : percentage
    const nextPaymentStatus = paymentStatus || currentCommission.paymentStatus || 'pending'

    candidate.advisorCommission = {
      salary: nextSalary,
      percentage: nextPercentage,
      amount: Math.round(nextSalary * (nextPercentage / 100)),
      paymentStatus: nextPaymentStatus,
      paidAt: nextPaymentStatus === 'paid' ? currentCommission.paidAt || new Date() : undefined
    }
  }

  await candidate.save()

  const savedCandidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
  await syncCmsFromCandidate(savedCandidate)
  await invalidateCandidateCaches()

  emitToAdmin('status_updated', {
    type: 'candidate',
    id: candidate._id.toString(),
    status: candidate.status
  })
  emitCandidateEvent('candidate_updated', 'candidate_updated', ownerUserId(savedCandidate), savedCandidate)
  emitCandidateEvent('student_updated', 'student_updated', ownerUserId(savedCandidate), savedCandidate)

  res.json(savedCandidate)
}

const reorderCandidates = async (req, res) => {
  const { orderedIds } = req.body

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ message: 'orderedIds must be an array' })
  }

  await Candidate.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { priorityOrder: index } }
      }
    }))
  )

  await invalidateCandidateCaches()
  emitToAdmin('reordered', { type: 'candidate', orderedIds })
  res.json({ orderedIds })
}

module.exports = {
  getCandidates,
  createCandidate,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
  uploadCandidateDocuments,
  deleteCandidateDocument,
  updateCandidateStatus,
  reorderCandidates,

  // Legacy aliases used by student-based frontend routes.
  getStudents: getCandidates,
  createStudent: createCandidate,
  getStudentById: getCandidateById,
  updateStudent: updateCandidate,
  deleteStudent: deleteCandidate,
  uploadStudentDocuments: uploadCandidateDocuments,
  deleteStudentDocument: deleteCandidateDocument,
  updateStudentStatus: updateCandidateStatus,
  reorderStudents: reorderCandidates
}
