const mongoose = require('mongoose')
const Placement = require('../models/Placement')
const Student = require('../models/Student')
const Company = require('../models/Company')
const User = require('../models/User')
const { emitToAdmin, emitToBA } = require('../socket')

const placementPopulate = (query) =>
  query
    .populate('studentId', 'candidateName mobileNumber appliedFor submittedBy selectionStatus')
    .populate('companyId', 'companyName jobRequirements.jobProfile')
    .populate('baId', 'name email')

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

const normalizePlacementForResponse = (placement) => {
  const offeredSalaryPM = resolveOfferedSalaryPM(placement)
  const earningPercent = resolveEarningPercent(placement)
  const earningAmount = resolveEarningAmount(placement)
  const earningStatus = resolveEarningStatus(placement)
  const earningPaidDate = resolveEarningPaidDate(placement)
  const salaryBasis = placement.salaryBasis || 1

  return {
    ...placement.toObject(),
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

const toMyPlacementPayload = (placement) => {
  const normalized = normalizePlacementForResponse(placement)

  return {
    _id: normalized._id,
    studentName: normalized.studentId?.candidateName,
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

    // compatibility payload
    student: {
      _id: normalized.studentId?._id,
      candidateName: normalized.studentId?.candidateName,
      mobileNumber: normalized.studentId?.mobileNumber,
      appliedFor: normalized.studentId?.appliedFor
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
    studentName: normalized.studentId?.candidateName,
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

    // compatibility aliases
    commissionAmount: normalized.earningAmount,
    commissionStatus: normalized.earningStatus,
    commissionPaidDate: normalized.earningPaidDate
  }
}

const normalizePlacementInput = (body) => {
  const offeredSalaryPM =
    body.offeredSalaryPM !== undefined ? Number(body.offeredSalaryPM) : parseLegacySalary(body.offeredSalary)
  const earningPercent =
    body.earningPercent !== undefined ? Number(body.earningPercent) : Number(body.commissionPercent || 0)
  const salaryBasis =
    body.salaryBasis !== undefined && body.salaryBasis !== null && body.salaryBasis !== ''
      ? Number(body.salaryBasis)
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
    studentId: body.studentId,
    companyId: body.companyId,
    jobProfile: body.jobProfile,
    offeredSalaryPM: Number.isFinite(offeredSalaryPM) ? offeredSalaryPM : undefined,
    joiningDate: body.joiningDate,
    selectionStatus,
    processStage: normalizedProcessStage,
    appointmentLetterDate: body.appointmentLetterDate || undefined,
    interviewDate: body.interviewDate || undefined,
    interviewMode: body.interviewMode || undefined,
    processNotes: body.processNotes,
    earningPercent: Number.isFinite(earningPercent) ? earningPercent : undefined,
    salaryBasis: Number.isFinite(salaryBasis) ? salaryBasis : undefined,
    adminNotes: body.adminNotes,
    earningStatus,
    earningPaidDate
  }
}

const updateStudentSelectionStatus = async (studentId, selectionStatus) => {
  await Student.findByIdAndUpdate(studentId, { $set: { selectionStatus } })
}

const validateObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`Invalid ${fieldName}`)
    error.statusCode = 400
    throw error
  }
}

const createPlacement = async (req, res) => {
  const payload = normalizePlacementInput(req.body)
  const { studentId, companyId } = payload

  if (!studentId || !companyId) {
    return res.status(400).json({ message: 'studentId and companyId are required' })
  }

  validateObjectId(studentId, 'studentId')
  validateObjectId(companyId, 'companyId')

  const [student, company, existing] = await Promise.all([
    Student.findById(studentId).populate('submittedBy', 'name email'),
    Company.findById(companyId),
    Placement.findOne({ studentId })
  ])

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  if (existing) {
    return res.status(409).json({ message: 'Placement already exists for this student' })
  }

  const placement = await Placement.create({
    ...payload,
    baId: student.submittedBy?._id || student.submittedBy
  })

  await updateStudentSelectionStatus(placement.studentId, placement.selectionStatus)

  const savedPlacement = await placementPopulate(Placement.findById(placement._id))
  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  emitToAdmin('placement_created', {
    placement: normalizedSavedPlacement,
    studentName: normalizedSavedPlacement.studentId?.candidateName,
    companyName: normalizedSavedPlacement.companyId?.companyName,
    baName: normalizedSavedPlacement.baId?.name
  })

  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'my_placement', toRoomPayload(savedPlacement))

  res.status(201).json(normalizedSavedPlacement)
}

const getPlacements = async (req, res) => {
  const query = {}
  const { baId, earningStatus, commissionStatus, selectionStatus, processStage, studentId, dateFrom, dateTo } = req.query

  if (baId) query.baId = baId
  if (earningStatus || commissionStatus) query.earningStatus = earningStatus || commissionStatus
  if (selectionStatus) query.selectionStatus = selectionStatus
  if (processStage) query.processStage = processStage
  if (studentId) query.studentId = studentId

  if (dateFrom || dateTo) {
    query.createdAt = {}
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
    if (dateTo) query.createdAt.$lte = new Date(dateTo)
  }

  const placements = await placementPopulate(Placement.find(query)).sort({ createdAt: -1 })
  res.json(placements.map(normalizePlacementForResponse))
}

const getMyPlacements = async (req, res) => {
  const placements = await placementPopulate(Placement.find({ baId: req.user._id })).sort({ createdAt: -1 })
  res.json(placements.map(toMyPlacementPayload))
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
  await updateStudentSelectionStatus(placement.studentId, placement.selectionStatus)

  const savedPlacement = await placementPopulate(Placement.findById(placement._id))
  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'placement_updated', toRoomPayload(savedPlacement))
  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'my_placement', toRoomPayload(savedPlacement))

  res.json(normalizedSavedPlacement)
}

const markPlacementPaid = async (req, res) => {
  const placement = await Placement.findById(req.params.id)

  if (!placement) {
    return res.status(404).json({ message: 'Placement not found' })
  }

  const earningStatus = req.body.earningStatus || req.body.commissionStatus
  const earningPaidDate = req.body.earningPaidDate || req.body.commissionPaidDate

  if (earningStatus !== 'paid') {
    return res.status(400).json({ message: "earningStatus must be 'paid'" })
  }

  placement.earningStatus = 'paid'
  placement.earningPaidDate = earningPaidDate ? new Date(earningPaidDate) : new Date()
  await placement.save()

  const savedPlacement = await placementPopulate(Placement.findById(placement._id))
  const normalizedSavedPlacement = normalizePlacementForResponse(savedPlacement)

  const paidPayload = {
    placementId: normalizedSavedPlacement._id,
    studentName: normalizedSavedPlacement.studentId?.candidateName,
    earningAmount: normalizedSavedPlacement.earningAmount,
    paidDate: normalizedSavedPlacement.earningPaidDate,

    // compatibility alias
    commissionAmount: normalizedSavedPlacement.earningAmount
  }

  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'earning_paid', paidPayload)
  emitToBA(savedPlacement.baId?._id || savedPlacement.baId, 'commission_paid', paidPayload)

  res.json(normalizedSavedPlacement)
}

const getCommissionSummary = async (_req, res) => {
  const rows = await Placement.aggregate([
    {
      $group: {
        _id: '$baId',
        totalPlacements: { $sum: 1 },
        totalEarnings: { $sum: '$earningAmount' },
        paidAmount: {
          $sum: {
            $cond: [{ $eq: ['$earningStatus', 'paid'] }, '$earningAmount', 0]
          }
        },
        pendingAmount: {
          $sum: {
            $cond: [{ $eq: ['$earningStatus', 'pending'] }, '$earningAmount', 0]
          }
        }
      }
    },
    { $sort: { totalEarnings: -1 } }
  ])

  const baIds = rows.map((row) => row._id)
  const baUsers = await User.find({ _id: { $in: baIds } }, 'name')
  const baNameById = new Map(baUsers.map((user) => [user._id.toString(), user.name]))

  res.json(
    rows.map((row) => ({
      baId: row._id,
      baName: baNameById.get(row._id.toString()) || 'Business Advisor',
      totalPlacements: row.totalPlacements,
      totalEarnings: Number(row.totalEarnings || 0),
      paidAmount: Number(row.paidAmount || 0),
      pendingAmount: Number(row.pendingAmount || 0),

      // compatibility alias
      totalCommission: Number(row.totalEarnings || 0)
    }))
  )
}

const getBaCommissionSummary = async (req, res) => {
  validateObjectId(req.params.baId, 'baId')
  const baId = new mongoose.Types.ObjectId(req.params.baId)

  const [summaryRow] = await Placement.aggregate([
    { $match: { baId } },
    {
      $group: {
        _id: '$baId',
        totalPlacements: { $sum: 1 },
        totalEarnings: { $sum: '$earningAmount' },
        paidAmount: {
          $sum: {
            $cond: [{ $eq: ['$earningStatus', 'paid'] }, '$earningAmount', 0]
          }
        },
        pendingAmount: {
          $sum: {
            $cond: [{ $eq: ['$earningStatus', 'pending'] }, '$earningAmount', 0]
          }
        }
      }
    }
  ])

  const placements = await placementPopulate(Placement.find({ baId })).sort({ createdAt: -1 })
  const ba = await User.findById(req.params.baId, 'name email')

  res.json({
    baId: req.params.baId,
    baName: ba?.name || 'Business Advisor',
    totalPlacements: summaryRow?.totalPlacements || 0,
    totalEarnings: Number(summaryRow?.totalEarnings || 0),
    paidAmount: Number(summaryRow?.paidAmount || 0),
    pendingAmount: Number(summaryRow?.pendingAmount || 0),
    placements: placements.map(normalizePlacementForResponse),

    // compatibility alias
    totalCommission: Number(summaryRow?.totalEarnings || 0)
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
