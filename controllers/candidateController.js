const Candidate = require('../models/Candidate')
const Placement = require('../models/Placement')
const { emitToAdmin, emitToBA } = require('../socket')
const { uploadToS3 } = require('../utils/s3Upload')
const { validateUploadFile } = require('../utils/fileValidation')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emitCandidateEvent = (adminEvent, baEvent, baId, payload) => {
  emitToAdmin(adminEvent, payload)
  emitToBA(baId, baEvent, payload)
}

const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

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

const ensureUniqueCandidateIdentity = async (payload, excludeId) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await Candidate.findOne(query).select('_id')
    if (existing) {
      const error = new Error(`A candidate with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const populateCandidate = (query) => query.populate('submittedBy', 'name email')

const canAccess = (req, candidate) => {
  const ownerId = candidate.submittedBy?._id || candidate.submittedBy
  return req.user.role === 'superAdmin' || ownerId.toString() === req.user._id.toString()
}

const ownerUserId = (candidate) => candidate?.submittedBy?._id || candidate?.submittedBy

const getCandidates = async (req, res) => {
  const query = req.user.role === 'superAdmin' ? {} : { submittedBy: req.user._id }
  const candidates = await Candidate.find(query)
    .populate('submittedBy', 'name email')
    .sort({ status: 1, priorityOrder: 1, createdAt: -1 })

  res.json(candidates)
}

const createCandidate = async (req, res) => {
  normalizeCandidateIdentity(req.body)
  await ensureUniqueCandidateIdentity(req.body)

  await Candidate.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  let candidate = await Candidate.create({
    ...req.body,
    submittedBy: req.user._id,
    source: 'admin_panel',
    status: 'not_viewed',
    priorityOrder: 0
  })

  candidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')
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

  await candidate.deleteOne()

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
  emitCandidateEvent('candidate_updated', 'candidate_updated', ownerUserId(savedCandidate), savedCandidate)
  emitCandidateEvent('student_updated', 'student_updated', ownerUserId(savedCandidate), savedCandidate)

  res.json(savedCandidate)
}

const updateCandidateStatus = async (req, res) => {
  const { status, adminNotes } = req.body
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

  await candidate.save()

  const savedCandidate = await Candidate.findById(candidate._id).populate('submittedBy', 'name email')

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
