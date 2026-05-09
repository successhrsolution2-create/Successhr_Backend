const mongoose = require('mongoose')
const Placement = require('../models/Placement')
const Candidate = require('../models/Candidate')
const Company = require('../models/Company')
const { syncCmsFromCandidate } = require('../utils/candidateStatusSync')
const User = require('../models/User')
const { emitToAdmin, emitToBA } = require('../socket')
const { invalidateCache } = require('../src/utils/invalidateCache')

const placementPopulate = (query) =>
  query
    .populate('candidateId', 'candidateName mobileNumber appliedFor submittedBy selectionStatus')
    .populate('companyId', 'companyName jobRequirements.jobProfile')
    .populate('baId', 'name email')

const candidateRefQuery = (candidateId) => ({
  $or: [{ candidateId }, { studentId: candidateId }]
})

const parseLegacySalary = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const resolveOfferedSalaryPM = (placement) => {
  if (placement.offeredSalaryPM !== undefined && placement.offeredSalaryPM !== null) {
    return Number(placement.offeredSalaryPM) || 0
  }
  return parseLegacySalary(placement.offeredSalary)
}

const resolveEarningPercent = (placement) => {
  if (placement.earningPercent !== undefined && placement.earningPercent !== null) {
    return Number(placement.earningPercent) || 0
  }
  return Number(placement.commissionPercent || 0)
}

const resolveEarningAmount = (placement) => {
  if (placement.earningAmount !== undefined && placement.earningAmount !== null) {
    return Number(placement.earningAmount) || 0
  }
  return Number(placement.commissionAmount || 0)
}

const resolveEarningStatus = (placement) => placement.earningStatus || placement.commissionStatus || 'pending'
const resolveEarningPaidDate = (placement) => placement.earningPaidDate || placement.commissionPaidDate
const processStageFromSelectionStatus = {
  shortlisted: 'appointment_letter_pending',
  selected: 'selected',
  joined: 'joined',
  rejected: 'rejected',
  on_hold: 'on_hold'
}
const selectionStatusFromProcessStage = {
  appointment_letter_pending: 'shortlisted',
  appointment_letter_shared: 'shortlisted',
  interview_scheduled: 'shortlisted',
  interview_completed: 'shortlisted',
  selected: 'selected',
  joined: 'joined',
  rejected: 'rejected',
  on_hold: 'on_hold'
}

const validateDateInput = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} must be a valid date`)
    error.statusCode = 400
    throw error
  }
}

const parseNumericInput = (value) => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const sanitized = value.replace(/,/g, '').trim()
    if (!sanitized) return undefined
    const parsed = Number(sanitized)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeInterviewMode = (value) => {
  if (value === undefined || value === null || value === '') return undefined
  const raw = String(value).trim()
  if (!raw) return undefined
  const normalized = raw.toLowerCase()
  const map = {
    online: 'Online',
    offline: 'Offline',
    telephonic: 'Telephonic',
    hybrid: 'Hybrid'
  }
  return map[normalized] || raw
}

const validatePlacementInput = (body) => {
  if (body.offeredSalaryPM !== undefined && body.offeredSalaryPM !== null && body.offeredSalaryPM !== '') {
    const offeredSalaryPM = parseNumericInput(body.offeredSalaryPM)
    if (!Number.isFinite(offeredSalaryPM) || offeredSalaryPM < 0) {
      const error = new Error('Offered salary must be a valid non-negative number')
      error.statusCode = 400
      throw error
    }
  }

  if (body.earningPercent !== undefined && body.earningPercent !== null && body.earningPercent !== '') {
    const earningPercent = parseNumericInput(body.earningPercent)
    if (!Number.isFinite(earningPercent) || earningPercent < 0 || earningPercent > 100) {
      const error = new Error('Earning percent must be between 0 and 100')
      error.statusCode = 400
      throw error
    }
  }

  if (body.salaryBasis !== undefined && body.salaryBasis !== null && body.salaryBasis !== '') {
    const salaryBasis = parseNumericInput(body.salaryBasis)
    if (!Number.isFinite(salaryBasis) || !Number.isInteger(salaryBasis) || salaryBasis < 1 || salaryBasis > 12) {
      const error = new Error('Salary basis must be an integer between 1 and 12')
      error.statusCode = 400
      throw error
    }
  }

  if (body.selectionStatus && !Placement.selectionStatuses.includes(body.selectionStatus)) {
    const error = new Error('Invalid selection status')
    error.statusCode = 400
    throw error
  }

  if (body.processStage && !Placement.processStages.includes(body.processStage)) {
    const error = new Error('Invalid process stage')
    error.statusCode = 400
    throw error
  }

  const interviewMode = normalizeInterviewMode(body.interviewMode)
  if (interviewMode && !Placement.interviewModes.includes(interviewMode)) {
    const error = new Error('Invalid interview mode')
    error.statusCode = 400
    throw error
  }

  validateDateInput(body.joiningDate, 'Joining date')
  validateDateInput(body.appointmentLetterDate, 'Appointment letter date')
  validateDateInput(body.interviewDate, 'Interview date')
  validateDateInput(body.earningPaidDate || body.commissionPaidDate, 'Paid date')
}

const normalizePlacementForResponse = (placement) => {
  const offeredSalaryPM = resolveOfferedSalaryPM(placement)
  const earningPercent = resolveEarningPercent(placement)
  const earningAmount = resolveEarningAmount(placement)
  const earningStatus = resolveEarningStatus(placement)
  const earningPaidDate = resolveEarningPaidDate(placement)
  const salaryBasis = placement.salaryBasis || 1

  return {
    ...placement.toObject(),
    studentId: placement.candidateId,
    offeredSalaryPM,
    earningPercent,
    earningAmount,
    earningStatus,
    earningPaidDate,
    salaryBasis,
    commissionPercent: earningPercent,
    commissionAmount: earningAmount,
    commissionStatus: earningStatus,
    commissionPaidDate: earningPaidDate,
    offeredSalary: `Rs ${offeredSalaryPM} PM`
  }
}

const isLivePlacement = (placement) => Boolean(placement?.candidateId && placement?.companyId)

const toMyPlacementPayload = (placement) => {
  const normalized = normalizePlacementForResponse(placement)

  return {
    _id: normalized._id,
    candidateName: normalized.candidateId?.candidateName,
    studentName: normalized.candidateId?.candidateName,
    companyName: normalized.companyId?.companyName,
    jobProfile: normalized.jobProfile,
    offeredSalaryPM: normalized.offeredSalaryPM,
    joiningDate: normalized.joiningDate,
    selectionStatus: normalized.selectionStatus,
    processStage: normalized.processStage,
    appointmentLetterDate: normalized.appointmentLetterDate,
    interviewDate: normalized.interviewDate,
    interviewMode: normalized.interviewMode,
    processNotes: normalized.processNotes,
    earningPercent: normalized.earningPercent,
    earningAmount: normalized.earningAmount,
    earningStatus: normalized.earningStatus,
    earningPaidDate: normalized.earningPaidDate,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,

    candidate: {
      _id: normalized.candidateId?._id,
      candidateName: normalized.candidateId?.candidateName,
      mobileNumber: normalized.candidateId?.mobileNumber,
      appliedFor: normalized.candidateId?.appliedFor
    },
    student: {
      _id: normalized.candidateId?._id,
      candidateName: normalized.candidateId?.candidateName,
      mobileNumber: normalized.candidateId?.mobileNumber,
      appliedFor: normalized.candidateId?.appliedFor
    },
    company: {
      _id: normalized.companyId?._id,
      companyName: normalized.companyId?.companyName
    },
    commissionPercent: normalized.commissionPercent,
    commissionAmount: normalized.commissionAmount,
    commissionStatus: normalized.commissionStatus,
    commissionPaidDate: normalized.commissionPaidDate,
    offeredSalary: normalized.offeredSalary
  }
}

const toRoomPayload = (placement) => {
  const normalized = normalizePlacementForResponse(placement)

  return {
    placementId: normalized._id,
    candidateName: normalized.candidateId?.candidateName,
    studentName: normalized.candidateId?.candidateName,
    companyName: normalized.companyId?.companyName,
    offeredSalaryPM: normalized.offeredSalaryPM,
    earningAmount: normalized.earningAmount,
    selectionStatus: normalized.selectionStatus,
    processStage: normalized.processStage,
    appointmentLetterDate: normalized.appointmentLetterDate,
    interviewDate: normalized.interviewDate,
    interviewMode: normalized.interviewMode,
    processNotes: normalized.processNotes,
    earningStatus: normalized.earningStatus,
    earningPaidDate: normalized.earningPaidDate,

    commissionAmount: normalized.earningAmount,
    commissionStatus: normalized.earningStatus,
    commissionPaidDate: normalized.earningPaidDate
  }
}

const toAdminPlacementEventPayload = (placement) => {
  const normalized = normalizePlacementForResponse(placement)
  return {
    placement: normalized,
    candidateName: normalized.candidateId?.candidateName,
    studentName: normalized.candidateId?.candidateName,
    companyName: normalized.companyId?.companyName,
    baName: normalized.baId?.name
  }
}

const normalizePlacementInput = (body) => {
  const offeredSalaryPM =
    body.offeredSalaryPM !== undefined ? parseNumericInput(body.offeredSalaryPM) : parseLegacySalary(body.offeredSalary)
  const earningPercent =
    body.earningPercent !== undefined ? parseNumericInput(body.earningPercent) : parseNumericInput(body.commissionPercent || 0)
  const salaryBasis =
    body.salaryBasis !== undefined && body.salaryBasis !== null && body.salaryBasis !== ''
      ? parseNumericInput(body.salaryBasis)
      : undefined
  const processStage = body.processStage || undefined
  let selectionStatus = body.selectionStatus
  if (!selectionStatus && processStage && selectionStatusFromProcessStage[processStage]) {
    selectionStatus = selectionStatusFromProcessStage[processStage]
  }
  let normalizedProcessStage = processStage
  if (!normalizedProcessStage && selectionStatus && processStageFromSelectionStatus[selectionStatus]) {
    normalizedProcessStage = processStageFromSelectionStatus[selectionStatus]
  }
  const earningStatus = body.earningStatus || body.commissionStatus
  const earningPaidDate = body.earningPaidDate || body.commissionPaidDate

  return {
    candidateId: body.candidateId || body.studentId,
    companyId: body.companyId,
    jobProfile: body.jobProfile,
    offeredSalaryPM: Number.isFinite(offeredSalaryPM) ? offeredSalaryPM : undefined,
    joiningDate: body.joiningDate,
    selectionStatus,
    processStage: normalizedProcessStage,
    appointmentLetterDate: body.appointmentLetterDate || undefined,
    interviewDate: body.interviewDate || undefined,
    interviewMode: normalizeInterviewMode(body.interviewMode),
    processNotes: body.processNotes,
    earningPercent: Number.isFinite(earningPercent) ? earningPercent : undefined,
    salaryBasis: Number.isFinite(salaryBasis) ? salaryBasis : undefined,
    adminNotes: body.adminNotes,
    earningStatus,
    earningPaidDate
  }
}

const updateCandidateSelectionStatus = async (candidateId, selectionStatus) => {
  const candidate = await Candidate.findByIdAndUpdate(candidateId, { $set: { selectionStatus } }, { new: true })
  if (candidate) {
    try {
      await syncCmsFromCandidate(candidate)
    } catch (error) {
      console.error('CMS sync failed during placement update:', error.message)
    }
  }
}

const validateObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`Invalid ${fieldName}`)
    error.statusCode = 400
    throw error
  }
}

const parseQueryDate = (value, fieldName) => {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} must be a valid date`)
    error.statusCode = 400
    throw error
  }
  return parsed
}

const createPlacement = async (req, res) => {
  validatePlacementInput(req.body)
  const payload = normalizePlacementInput(req.body)
  const { candidateId, companyId } = payload

  if (!candidateId || !companyId) {
    return res.status(400).json({ message: 'candidateId and companyId are required' })
  }

  validateObjectId(candidateId, 'candidateId')
  validateObjectId(companyId, 'companyId')

  const [candidate, company, existing] = await Promise.all([
    Candidate.findById(candidateId).populate('submittedBy', 'name email'),
    Company.findById(companyId),
    Placement.findOne(candidateRefQuery(candidateId))
  ])

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate reference not found' })
  }

  if (!candidate.submittedBy) {
    return res.status(400).json({ message: 'Candidate reference has no submitting advisor linked' })
  }

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  if (existing) {
    return res.status(409).json({ message: 'Placement already exists for this candidate' })
  }

  const placement = await Placement.create({
    ...payload,
    baId: candidate.submittedBy?._id || candidate.submittedBy
  })

  await updateCandidateSelectionStatus(placement.candidateId, placement.selectionStatus)

  const savedPlacement = await placementPopulate(Placement.findById(placement._id))
  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  emitToAdmin('placement_created', toAdminPlacementEventPayload(savedPlacement))

  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'my_placement', toRoomPayload(savedPlacement))

  invalidateCache('/api/placements').catch(() => {})
  invalidateCache(`/api/placements/${placement._id.toString()}`).catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  res.status(201).json(normalizedSavedPlacement)
}

const getPlacements = async (req, res) => {
  const query = {}
  const {
    baId,
    earningStatus,
    commissionStatus,
    selectionStatus,
    processStage,
    candidateId,
    studentId,
    dateFrom,
    dateTo
  } = req.query

  if (baId) {
    validateObjectId(baId, 'baId')
    query.baId = baId
  }
  if (earningStatus || commissionStatus) query.earningStatus = earningStatus || commissionStatus
  if (selectionStatus) query.selectionStatus = selectionStatus
  if (processStage) query.processStage = processStage
  const resolvedCandidateId = candidateId || studentId
  if (resolvedCandidateId) {
    validateObjectId(resolvedCandidateId, 'candidateId')
    Object.assign(query, candidateRefQuery(resolvedCandidateId))
  }

  if (dateFrom || dateTo) {
    const from = parseQueryDate(dateFrom, 'dateFrom')
    const to = parseQueryDate(dateTo, 'dateTo')
    query.createdAt = {}
    if (from) query.createdAt.$gte = from
    if (to) query.createdAt.$lte = to
  }

  const placements = await placementPopulate(Placement.find(query)).sort({ createdAt: -1 })
  res.json(placements.filter(isLivePlacement).map(normalizePlacementForResponse))
}

const getMyPlacements = async (req, res) => {
  const placements = await placementPopulate(Placement.find({ baId: req.user._id })).sort({ createdAt: -1 })
  res.json(placements.filter(isLivePlacement).map(toMyPlacementPayload))
}

const getPlacementById = async (req, res) => {
  const placement = await placementPopulate(Placement.findById(req.params.id))

  if (!placement) {
    return res.status(404).json({ message: 'Placement not found' })
  }

  if (req.user.role === 'businessAdvisor' && placement.baId?._id?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You can only access your own placements' })
  }

  if (req.user.role === 'businessAdvisor') {
    return res.json(toMyPlacementPayload(placement))
  }

  return res.json(normalizePlacementForResponse(placement))
}

const updatePlacement = async (req, res) => {
  validatePlacementInput(req.body)
  const placement = await Placement.findById(req.params.id)

  if (!placement) {
    return res.status(404).json({ message: 'Placement not found' })
  }

  const payload = normalizePlacementInput(req.body)

  const updatableFields = [
    'companyId',
    'jobProfile',
    'offeredSalaryPM',
    'joiningDate',
    'selectionStatus',
    'processStage',
    'appointmentLetterDate',
    'interviewDate',
    'interviewMode',
    'processNotes',
    'adminNotes',
    'earningPercent',
    'salaryBasis',
    'earningStatus',
    'earningPaidDate'
  ]

  for (const field of updatableFields) {
    if (payload[field] !== undefined) {
      placement[field] = payload[field]
    }
  }

  if (placement.companyId) {
    validateObjectId(placement.companyId, 'companyId')
    const company = await Company.findById(placement.companyId)
    if (!company) {
      return res.status(404).json({ message: 'Company reference not found' })
    }
  }

  if (placement.earningStatus !== 'paid') {
    placement.earningPaidDate = undefined
  } else if (!placement.earningPaidDate) {
    placement.earningPaidDate = new Date()
  }

  await placement.save()
  await updateCandidateSelectionStatus(placement.candidateId, placement.selectionStatus)

  const savedPlacement = await placementPopulate(Placement.findById(placement._id))
  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'placement_updated', toRoomPayload(savedPlacement))
  emitToAdmin('placement_updated', toAdminPlacementEventPayload(savedPlacement))

  invalidateCache('/api/placements').catch(() => {})
  invalidateCache(`/api/placements/${req.params.id}`).catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  invalidateCache(`/api/placements/ba/${savedPlacement.baId?._id || savedPlacement.baId}/summary`).catch(() => {})
  res.json(normalizedSavedPlacement)
}

const markPlacementPaid = async (req, res) => {
  const earningStatus = req.body.earningStatus || req.body.commissionStatus
  const earningPaidDate = req.body.earningPaidDate || req.body.commissionPaidDate

  if (earningStatus !== 'paid') {
    return res.status(400).json({ message: "earningStatus must be 'paid'" })
  }

  validateDateInput(earningPaidDate, 'Paid date')

  const savedPlacement = await placementPopulate(
    Placement.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          earningStatus: 'paid',
          earningPaidDate: earningPaidDate ? new Date(earningPaidDate) : new Date()
        }
      },
      { new: true, runValidators: true }
    )
  )

  if (!savedPlacement) {
    return res.status(404).json({ message: 'Placement not found' })
  }

  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  const paidPayload = {
    placementId: normalizedSavedPlacement._id,
    candidateName: normalizedSavedPlacement.candidateId?.candidateName,
    studentName: normalizedSavedPlacement.candidateId?.candidateName,
    earningAmount: normalizedSavedPlacement.earningAmount,
    paidDate: normalizedSavedPlacement.earningPaidDate,

    // compatibility alias
    commissionAmount: normalizedSavedPlacement.earningAmount
  }

  const baRoomPayload = toRoomPayload(savedPlacement)
  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'earning_paid', paidPayload)
  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'commission_paid', paidPayload)
  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'placement_updated', baRoomPayload)
  emitToAdmin('placement_paid', toAdminPlacementEventPayload(savedPlacement))
  emitToAdmin('placement_updated', toAdminPlacementEventPayload(savedPlacement))

  invalidateCache('/api/placements').catch(() => {})
  invalidateCache(`/api/placements/${req.params.id}`).catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  invalidateCache(`/api/placements/ba/${savedPlacement.baId?._id || savedPlacement.baId}/summary`).catch(() => {})
  res.json(normalizedSavedPlacement)
}

const getCommissionSummary = async (_req, res) => {
  const placements = await placementPopulate(Placement.find({}))
  const grouped = new Map()

  placements.filter(isLivePlacement).forEach((placement) => {
    const normalized = normalizePlacementForResponse(placement)
    const baId = placement.baId?._id || placement.baId
    if (!baId) return

    const key = baId.toString()
    if (!grouped.has(key)) {
      grouped.set(key, {
        baId,
        baName: placement.baId?.name || 'Business Advisor',
        totalPlacements: 0,
        totalEarnings: 0,
        paidAmount: 0,
        pendingAmount: 0
      })
    }

    const row = grouped.get(key)
    const amount = Number(normalized.earningAmount || 0)
    row.totalPlacements += 1
    row.totalEarnings += amount
    if (normalized.earningStatus === 'paid') {
      row.paidAmount += amount
    } else {
      row.pendingAmount += amount
    }
  })

  res.json(
    [...grouped.values()]
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .map((row) => ({
        ...row,
        totalCommission: row.totalEarnings
      }))
  )
}

const getBaCommissionSummary = async (req, res) => {
  validateObjectId(req.params.baId, 'baId')
  const baId = new mongoose.Types.ObjectId(req.params.baId)

  const placements = await placementPopulate(Placement.find({ baId })).sort({ createdAt: -1 })
  const livePlacements = placements.filter(isLivePlacement)
  const ba = await User.findById(req.params.baId, 'name email')
  const totals = livePlacements.reduce(
    (acc, placement) => {
      const normalized = normalizePlacementForResponse(placement)
      const amount = Number(normalized.earningAmount || 0)
      acc.totalPlacements += 1
      acc.totalEarnings += amount
      if (normalized.earningStatus === 'paid') {
        acc.paidAmount += amount
      } else {
        acc.pendingAmount += amount
      }
      return acc
    },
    { totalPlacements: 0, totalEarnings: 0, paidAmount: 0, pendingAmount: 0 }
  )

  res.json({
    baId: req.params.baId,
    baName: ba?.name || 'Business Advisor',
    totalPlacements: totals.totalPlacements,
    totalEarnings: totals.totalEarnings,
    paidAmount: totals.paidAmount,
    pendingAmount: totals.pendingAmount,
    placements: livePlacements.map(normalizePlacementForResponse),

    // compatibility alias
    totalCommission: totals.totalEarnings
  })
}

module.exports = {
  createPlacement,
  getPlacements,
  getMyPlacements,
  getPlacementById,
  updatePlacement,
  markPlacementPaid,
  getCommissionSummary,
  getBaCommissionSummary
}

