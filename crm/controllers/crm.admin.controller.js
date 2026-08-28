const mongoose = require('mongoose')
const CrmUser = require('../models/CrmUser.model')
const CrmCandidate = require('../models/CrmCandidate.model')
const CrmCallLog = require('../models/CrmCallLog.model')
const { ensureLoginIdentityAvailable } = require('../../utils/loginIdentity')

const { CANDIDATE_CLASSES, CALL_STATUSES, INTERESTED_STATUSES, REGISTRATION_INFO } = CrmCandidate

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const objectIdPattern = /^[a-f\d]{24}$/i

const createHttpError = (statusCode, message) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const sendError = (res, error, fallbackMessage = 'CRM admin request failed') => {
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0]
    const message = duplicateField === 'email' ? 'CRM employee email already exists' : 'Duplicate CRM value already exists'
    return res.status(409).json({ success: false, message })
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: error.message })
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid CRM resource ID' })
  }

  const status = error.statusCode || 500
  const safeStatus = status >= 400 && status < 600 ? status : 500

  return res.status(safeStatus).json({
    success: false,
    message: safeStatus >= 500 ? fallbackMessage : error.message
  })
}

const getPagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || DEFAULT_PAGE, 1)
  const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
  const skip = (page - 1) * limit

  return { limit, page, skip }
}

const getPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(Math.ceil(total / limit), 1)
})

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isValidObjectId = (value) => objectIdPattern.test(String(value || ''))

const toObjectId = (value) => new mongoose.Types.ObjectId(value)

const parseSort = (query, allowedFields, fallbackField = 'createdAt') => {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : fallbackField
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1
  return { [sortBy]: sortOrder }
}

const parseBooleanQuery = (value) => value === true || value === 'true'

const parseDateBound = (value, label, endOfDay = false) => {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${label} must be a valid date`)
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }

  return date
}

const getEmployeeMatch = (query) => {
  const match = { role: 'crm_employee' }

  if (query.status === 'active') {
    match.isActive = true
  }

  if (query.status === 'inactive') {
    match.isActive = false
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i')
    match.$or = [{ name: regex }, { email: regex }]
  }

  return match
}

const buildCandidateMatch = (query, options = {}) => {
  const match = {}
  const includeInactive = parseBooleanQuery(query.includeInactive)

  if (!includeInactive && options.defaultActiveOnly !== false) {
    match.isActive = true
  }

  const recruiterId = query.employeeId || query.recruiterId
  if (recruiterId) {
    if (!isValidObjectId(recruiterId)) {
      throw createHttpError(400, 'Employee filter must be a valid CRM user ID')
    }
    match.recruiterId = toObjectId(recruiterId)
  }

  if (query.candidateClass) {
    if (!CANDIDATE_CLASSES.includes(query.candidateClass)) {
      throw createHttpError(400, 'Invalid candidate class filter')
    }
    match.candidateClass = query.candidateClass
  }

  if (query.callStatus) {
    if (!CALL_STATUSES.includes(query.callStatus)) {
      throw createHttpError(400, 'Invalid call status filter')
    }
    match.callStatus = query.callStatus
  }

  if (query.registrationInfo) {
    if (!REGISTRATION_INFO.includes(query.registrationInfo)) {
      throw createHttpError(400, 'Invalid registration info filter')
    }
    match.registrationInfo = query.registrationInfo
  }

  if (query.interested) {
    if (!INTERESTED_STATUSES.includes(query.interested)) {
      throw createHttpError(400, 'Invalid interested filter')
    }
    match['interested.status'] = query.interested
  }

  const startDate = parseDateBound(query.startDate || query.dateFrom || query.from, 'Start date')
  const endDate = parseDateBound(query.endDate || query.dateTo || query.to, 'End date', true)

  if (startDate || endDate) {
    match.createdAt = {}
    if (startDate) match.createdAt.$gte = startDate
    if (endDate) match.createdAt.$lte = endDate
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i')
    match.$or = [
      { candidateName: regex },
      { mobileNumber: regex },
      { education: regex },
      { jobNo: regex },
      { jobProfile: regex }
    ]
  }

  return match
}

const toPublicEmployee = (employee) => ({
  id: employee._id.toString(),
  name: employee.name,
  email: employee.email,
  role: employee.role,
  isActive: employee.isActive,
  createdBy: employee.createdBy,
  createdAt: employee.createdAt,
  updatedAt: employee.updatedAt
})

const csvCell = (value) => {
  if (value === null || value === undefined) return ''

  const stringValue = value instanceof Date ? value.toISOString() : String(value)
  if (!/[",\r\n]/.test(stringValue)) return stringValue

  return `"${stringValue.replace(/"/g, '""')}"`
}

const csvRow = (values) => `${values.map(csvCell).join(',')}\n`

const createEmployee = async (req, res) => {
  try {
    await ensureLoginIdentityAvailable({ email: req.body.email, employeeId: req.body.employeeId })

    const employee = await CrmUser.create({
      name: req.body.name,
      email: req.body.email,
      employeeId: req.body.employeeId,
      password: req.body.password,
      role: 'crm_employee',
      createdBy: req.user?._id || null
    })

    return res.status(201).json({
      success: true,
      message: 'CRM employee created successfully',
      data: { employee: toPublicEmployee(employee) }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to create CRM employee')
  }
}

const listEmployees = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const match = getEmployeeMatch(req.query)
    const sort = parseSort(req.query, ['createdAt', 'updatedAt', 'name', 'email'], 'createdAt')

    const [total, employees] = await Promise.all([
      CrmUser.countDocuments(match),
      CrmUser.aggregate([
        { $match: match },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'crm_candidates',
            localField: '_id',
            foreignField: 'recruiterId',
            as: 'candidateRecords'
          }
        },
        {
          $lookup: {
            from: 'crm_call_logs',
            let: { employeeId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$recruiterId', '$$employeeId'] } } },
              { $sort: { calledAt: -1 } },
              { $limit: 1 },
              { $project: { calledAt: 1, _id: 0 } }
            ],
            as: 'latestCall'
          }
        },
        {
          $addFields: {
            candidateCount: { $size: '$candidateRecords' },
            latestCandidateAt: { $max: '$candidateRecords.updatedAt' },
            lastCallAt: { $arrayElemAt: ['$latestCall.calledAt', 0] }
          }
        },
        {
          $addFields: {
            lastActiveAt: { $max: ['$latestCandidateAt', '$lastCallAt', '$updatedAt'] }
          }
        },
        {
          $project: {
            password: 0,
            __v: 0,
            candidateRecords: 0,
            latestCall: 0,
            latestCandidateAt: 0
          }
        }
      ])
    ])

    return res.status(200).json({
      success: true,
      data: {
        employees,
        pagination: getPaginationMeta(total, page, limit)
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to list CRM employees')
  }
}

const updateEmployee = async (req, res) => {
  try {
    const employee = await CrmUser.findOne({ _id: req.params.id, role: 'crm_employee' }).select('+password')

    if (!employee) {
      throw createHttpError(404, 'CRM employee not found')
    }

    if (req.body.email) {
      await ensureLoginIdentityAvailable({ email: req.body.email }, { exclude: { crmUser: employee._id } })
      employee.email = req.body.email
    }

    if (req.body.employeeId !== undefined) {
      await ensureLoginIdentityAvailable({ employeeId: req.body.employeeId }, { exclude: { crmUser: employee._id } })
      employee.employeeId = req.body.employeeId
    }

    if (req.body.name) employee.name = req.body.name
    if (req.body.password) {
      employee.password = req.body.password
      employee.tokenVersion = Number(employee.tokenVersion || 0) + 1
    }
    if (typeof req.body.isActive === 'boolean') employee.isActive = req.body.isActive

    await employee.save()

    return res.status(200).json({
      success: true,
      message: 'CRM employee updated successfully',
      data: { employee: toPublicEmployee(employee) }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to update CRM employee')
  }
}

const toggleEmployee = async (req, res) => {
  try {
    const employee = await CrmUser.findOne({ _id: req.params.id, role: 'crm_employee' })

    if (!employee) {
      throw createHttpError(404, 'CRM employee not found')
    }

    employee.isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : !employee.isActive
    await employee.save()

    return res.status(200).json({
      success: true,
      message: `CRM employee ${employee.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { employee: toPublicEmployee(employee) }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to update CRM employee status')
  }
}

const deleteEmployee = async (req, res) => {
  try {
    const employee = await CrmUser.findOne({ _id: req.params.id, role: 'crm_employee' })

    if (!employee) {
      throw createHttpError(404, 'CRM employee not found')
    }

    await CrmUser.deleteOne({ _id: employee._id })

    return res.status(200).json({
      success: true,
      message: 'CRM employee deleted successfully',
      data: { employeeId: employee._id.toString() }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to delete CRM employee')
  }
}

const listCandidates = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const match = buildCandidateMatch(req.query)
    const sort = parseSort(
      req.query,
      ['createdAt', 'updatedAt', 'candidateName', 'candidateClass', 'callStatus'],
      'createdAt'
    )

    const [total, candidates] = await Promise.all([
      CrmCandidate.countDocuments(match),
      CrmCandidate.aggregate([
        { $match: match },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'crm_users',
            localField: 'recruiterId',
            foreignField: '_id',
            as: 'recruiter'
          }
        },
        {
          $lookup: {
            from: 'crm_call_logs',
            let: { candidateId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$candidateId', '$$candidateId'] } } },
              { $sort: { calledAt: -1 } },
              { $limit: 1 },
              { $project: { calledAt: 1, status: 1, remark: 1 } }
            ],
            as: 'latestCall'
          }
        },
        {
          $addFields: {
            recruiter: { $arrayElemAt: ['$recruiter', 0] },
            latestCall: { $arrayElemAt: ['$latestCall', 0] }
          }
        },
        {
          $project: {
            __v: 0,
            'recruiter.password': 0,
            'recruiter.__v': 0
          }
        }
      ])
    ])

    return res.status(200).json({
      success: true,
      data: {
        candidates,
        pagination: getPaginationMeta(total, page, limit)
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to list CRM candidates')
  }
}

const getReports = async (req, res) => {
  try {
    const candidateMatch = buildCandidateMatch(req.query)
    const callMatch = {}

    if (candidateMatch.recruiterId) {
      callMatch.recruiterId = candidateMatch.recruiterId
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    callMatch.calledAt = { $gte: todayStart, $lte: todayEnd }

    const [employeeTotal, activeEmployeeTotal, candidateTotals, byClassRows, byStatusRows, byEmployeeRows, todaysCalls] =
      await Promise.all([
        CrmUser.countDocuments({ role: 'crm_employee' }),
        CrmUser.countDocuments({ role: 'crm_employee', isActive: true }),
        CrmCandidate.aggregate([
          { $match: candidateMatch },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
              inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
              sure: { $sum: { $cond: [{ $eq: ['$callStatus', 'sure'] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$callStatus', 'pending'] }, 1, 0] } },
              followup: { $sum: { $cond: [{ $eq: ['$callStatus', 'followup'] }, 1, 0] } }
            }
          }
        ]),
        CrmCandidate.aggregate([
          { $match: candidateMatch },
          { $group: { _id: '$candidateClass', count: { $sum: 1 } } }
        ]),
        CrmCandidate.aggregate([
          { $match: candidateMatch },
          { $group: { _id: '$callStatus', count: { $sum: 1 } } }
        ]),
        CrmCandidate.aggregate([
          { $match: candidateMatch },
          { $group: { _id: '$recruiterId', candidateCount: { $sum: 1 } } },
          {
            $lookup: {
              from: 'crm_users',
              localField: '_id',
              foreignField: '_id',
              as: 'employee'
            }
          },
          { $addFields: { employee: { $arrayElemAt: ['$employee', 0] } } },
          {
            $project: {
              recruiterId: '$_id',
              candidateCount: 1,
              employee: {
                id: '$employee._id',
                name: '$employee.name',
                email: '$employee.email',
                isActive: '$employee.isActive'
              },
              _id: 0
            }
          },
          { $sort: { candidateCount: -1 } }
        ]),
        CrmCallLog.countDocuments(callMatch)
      ])

    const totals = candidateTotals[0] || {
      total: 0,
      active: 0,
      inactive: 0,
      sure: 0,
      pending: 0,
      followup: 0
    }

    const byClass = CANDIDATE_CLASSES.reduce((acc, candidateClass) => {
      const row = byClassRows.find((item) => item._id === candidateClass)
      acc[candidateClass] = row?.count || 0
      return acc
    }, {})

    const byStatus = CALL_STATUSES.reduce((acc, status) => {
      const row = byStatusRows.find((item) => item._id === status)
      acc[status] = row?.count || 0
      return acc
    }, {})

    return res.status(200).json({
      success: true,
      data: {
        employees: {
          total: employeeTotal,
          active: activeEmployeeTotal,
          inactive: Math.max(employeeTotal - activeEmployeeTotal, 0)
        },
        candidates: {
          total: totals.total,
          active: totals.active,
          inactive: totals.inactive,
          sure: totals.sure,
          pending: totals.pending,
          followup: totals.followup,
          byClass,
          byStatus,
          byEmployee: byEmployeeRows
        },
        calls: {
          today: todaysCalls
        }
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to build CRM reports')
  }
}

const exportCandidates = async (req, res) => {
  try {
    const match = buildCandidateMatch(req.query)
    const fileDate = new Date().toISOString().slice(0, 10)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="crm-candidates-${fileDate}.csv"`)

    res.write(
      csvRow([
        'Candidate ID',
        'Candidate Name',
        'Mobile Number',
        'Education',
        'Job No',
        'Job Profile',
        'Interested',
        'Reason For Not Interested',
        'Availability For Interview',
        'Interview Date',
        'Interview Time',
        'Recruiter Name',
        'Recruiter Email',
        'Overall Calling Remark',
        'Candidate Class',
        'Source',
        'Call Status',
        'Active',
        'Created At',
        'Updated At'
      ])
    )

    const cursor = CrmCandidate.find(match)
      .populate('recruiterId', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .cursor()

    for await (const candidate of cursor) {
      res.write(
        csvRow([
          candidate._id,
          candidate.candidateName,
          candidate.mobileNumber,
          candidate.education,
          candidate.jobNo,
          candidate.jobProfile,
          candidate.interested?.status,
          candidate.interested?.reason,
          candidate.availabilityForInterview,
          candidate.interviewDate,
          candidate.interviewTime,
          candidate.recruiterId?.name,
          candidate.recruiterId?.email,
          candidate.overallCallingRemark,
          candidate.candidateClass,
          candidate.registrationInfo,
          candidate.callStatus,
          candidate.isActive,
          candidate.createdAt,
          candidate.updatedAt
        ])
      )
    }

    return res.end()
  } catch (error) {
    if (!res.headersSent) {
      return sendError(res, error, 'Failed to export CRM candidates')
    }

    return res.end()
  }
}

module.exports = {
  createEmployee,
  deleteEmployee,
  exportCandidates,
  getReports,
  listCandidates,
  listEmployees,
  toggleEmployee,
  updateEmployee
}
