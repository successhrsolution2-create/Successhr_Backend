const CrmCandidate = require('../models/CrmCandidate.model')
const CrmCallLog = require('../models/CrmCallLog.model')

const { CANDIDATE_CLASSES, CALL_STATUSES, INTERESTED_STATUSES, REGISTRATION_INFO } = CrmCandidate

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const BULK_IMPORT_MAX_ROWS = 500
const BULK_IMPORT_ROW_REPORT_LIMIT = 50
const BULK_DELETE_MAX_ROWS = 100
const MOBILE_PATTERN = /^[0-9]{10}$/
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

const CANDIDATE_TEXT_FIELDS = [
  ['candidateName', 'Candidate name', 2, 150],
  ['education', 'Education', 1, 150],
  ['jobNo', 'Job number', 1, 80],
  ['jobProfile', 'Job profile', 1, 180],
  ['availabilityForInterview', 'Availability for interview', 1, 180],
  ['interviewTime', 'Interview time', 1, 120],
  ['overallCallingRemark', 'Overall calling remark', 1, 3000]
]

const createHttpError = (statusCode, message) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const sendError = (res, error, fallbackMessage = 'CRM candidate request failed') => {
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0]
    const message =
      duplicateField === 'mobileNumber' ? 'CRM candidate mobile number already exists' : 'Duplicate CRM value already exists'
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

const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim())

const normalizeRegistrationInfo = (value) => {
  const text = normalizeText(value)
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')

  if (normalized === 'rc' || normalized === 'rc data') return 'RC data'
  if (normalized === 'wrc' || normalized === 'wrc data') return 'WRC data'
  if (normalized === 'college contacts' || normalized === 'college contact' || normalized === 'coleege contacts') return 'College contacts'

  return text
}

const addLimitedRowReport = (reports, rowReport) => {
  if (reports.length < BULK_IMPORT_ROW_REPORT_LIMIT) {
    reports.push(rowReport)
  }
}

const validateBulkTextField = (source, payload, errors, field, label, min, max) => {
  const value = normalizeText(source[field])

  if (!value) {
    errors.push(`${label} is required`)
  } else if (value.length < min) {
    errors.push(`${label} must be at least ${min} characters`)
  } else if (value.length > max) {
    errors.push(`${label} cannot exceed ${max} characters`)
  }

  payload[field] = value
}

const validateBulkEnumField = (source, payload, errors, field, label, allowedValues, normalizer = normalizeText) => {
  const value = normalizer(source[field])

  if (!value) {
    errors.push(`${label} is required`)
  } else if (!allowedValues.includes(value)) {
    errors.push(`${label} must be one of: ${allowedValues.join(', ')}`)
  }

  payload[field] = value
}

const normalizeBulkInterested = (source, errors) => {
  const interested = source?.interested && typeof source.interested === 'object' ? source.interested : {}
  const rawStatus =
    Object.prototype.hasOwnProperty.call(source || {}, 'interested') && typeof source.interested !== 'object'
      ? source.interested
      : interested.status || source?.interestedStatus
  const status = normalizeText(rawStatus).toLowerCase()

  if (!status) return undefined

  if (!INTERESTED_STATUSES.includes(status)) {
    errors.push('Interested status must be yes or no')
    return undefined
  }

  const reason = normalizeText(interested.reason || source?.interestedReason)

  if (status === 'no') {
    if (!reason) {
      errors.push('Reason for not interested is required when status is no')
    } else if (reason.length > 1000) {
      errors.push('Reason for not interested cannot exceed 1000 characters')
    }

    return { status, reason }
  }

  return { status }
}

const normalizeBulkCandidateRow = (row) => {
  const source = row?.payload && typeof row.payload === 'object' ? row.payload : row
  const rowNumber = Number(row?.rowNumber) || null
  const payload = {}
  const errors = []

  CANDIDATE_TEXT_FIELDS.forEach(([field, label, min, max]) => {
    validateBulkTextField(source || {}, payload, errors, field, label, min, max)
  })

  const interviewDate = normalizeText(source?.interviewDate)
  if (interviewDate) {
    if (interviewDate.length > 30) {
      errors.push('Interview date cannot exceed 30 characters')
    }
    payload.interviewDate = interviewDate
  }

  const mobileNumber = normalizeText(source?.mobileNumber).replace(/\D/g, '')
  if (!mobileNumber) {
    errors.push('Mobile number is required')
  } else if (!MOBILE_PATTERN.test(mobileNumber)) {
    errors.push('Mobile number must be exactly 10 digits')
  }
  payload.mobileNumber = mobileNumber

  validateBulkEnumField(source || {}, payload, errors, 'candidateClass', 'Candidate class', CANDIDATE_CLASSES)
  validateBulkEnumField(source || {}, payload, errors, 'registrationInfo', 'Source', REGISTRATION_INFO, normalizeRegistrationInfo)
  validateBulkEnumField(source || {}, payload, errors, 'callStatus', 'Call status', CALL_STATUSES, (value) =>
    normalizeText(value).toLowerCase()
  )

  const interested = normalizeBulkInterested(source || {}, errors)
  if (interested) {
    payload.interested = interested
  }

  return { errors, payload, rowNumber }
}

const getCandidateConflictInfo = (candidate, recruiterId) => {
  const assignedRecruiter = candidate.recruiterId
  const assignedRecruiterId = assignedRecruiter?._id || assignedRecruiter
  const isOwnCandidate = String(assignedRecruiterId || '') === String(recruiterId || '')

  if (!candidate.isActive) {
    return {
      reason: isOwnCandidate ? 'Mobile exists in inactive CRM record' : 'Mobile belongs to another deleted CRM record',
      existingCandidateName: candidate.candidateName,
      isActive: false
    }
  }

  if (isOwnCandidate) {
    return {
      reason: 'Mobile already exists in your CRM candidates',
      existingCandidateName: candidate.candidateName,
      isActive: true
    }
  }

  return {
    reason: 'Mobile already exists with another CRM employee',
    existingCandidateName: candidate.candidateName,
    assignedTo: assignedRecruiter?.name,
    isActive: true
  }
}

const isSameRecruiter = (candidate, recruiterId) => {
  const assignedRecruiter = candidate?.recruiterId
  const assignedRecruiterId = assignedRecruiter?._id || assignedRecruiter
  return String(assignedRecruiterId || '') === String(recruiterId || '')
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

const getSerialSearchNumber = (query) => {
  const rawValue = String(query.serialNumber || '').trim()
  if (!/^[1-9]\d*$/.test(rawValue)) return null

  const serialNumber = Number.parseInt(rawValue, 10)
  return Number.isSafeInteger(serialNumber) ? serialNumber : null
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

const parseSort = (query, allowedFields, fallbackField = 'createdAt') => {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : fallbackField
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1
  return { [sortBy]: sortOrder }
}

const getCandidateDateField = (query) => {
  const dateField = String(query.dateField || '').trim()
  if (!dateField) return 'createdAt'
  if (dateField === 'lastUpdate' || dateField === 'lastUpdatedAt') return 'updatedAt'
  if (['createdAt', 'updatedAt'].includes(dateField)) return dateField
  throw createHttpError(400, 'Invalid date field filter')
}

const applyCandidateFilters = (query, baseMatch) => {
  const match = { ...baseMatch }

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
    const interested = String(query.interested).toLowerCase()
    if (!INTERESTED_STATUSES.includes(interested)) {
      throw createHttpError(400, 'Invalid interested filter')
    }
    match['interested.status'] = interested
  }

  const startDate = parseDateBound(query.startDate || query.dateFrom || query.from, 'Start date')
  const endDate = parseDateBound(query.endDate || query.dateTo || query.to, 'End date', true)

  if (startDate || endDate) {
    const dateField = getCandidateDateField(query)
    match[dateField] = {}
    if (startDate) match[dateField].$gte = startDate
    if (endDate) match[dateField].$lte = endDate
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i')
    match.$or = [{ candidateName: regex }, { mobileNumber: regex }]
  }

  return match
}

const getCandidatePayload = (body, recruiterId) => ({
  candidateName: body.candidateName,
  mobileNumber: body.mobileNumber,
  education: body.education,
  jobNo: body.jobNo,
  jobProfile: body.jobProfile,
  interested: body.interested,
  availabilityForInterview: body.availabilityForInterview,
  ...(body.interviewDate ? { interviewDate: body.interviewDate } : {}),
  interviewTime: body.interviewTime,
  recruiterId,
  enteredRecruiterId: body.enteredRecruiterId,
  overallCallingRemark: body.overallCallingRemark,
  candidateClass: body.candidateClass,
  registrationInfo: body.registrationInfo,
  callStatus: body.callStatus
})

const findOwnActiveCandidate = async (candidateId, recruiterId) => {
  const candidate = await CrmCandidate.findOne({
    _id: candidateId,
    recruiterId,
    isActive: true
  })

  if (!candidate) {
    throw createHttpError(404, 'CRM candidate not found')
  }

  return candidate
}

const createCandidate = async (req, res) => {
  try {
    const payload = getCandidatePayload(req.body, req.crmUser._id)
    const existingCandidate = await CrmCandidate.findOne({ mobileNumber: req.body.mobileNumber })
      .select('candidateName mobileNumber recruiterId isActive')
      .populate('recruiterId', 'name')
      .lean()

    if (existingCandidate) {
      if (!existingCandidate.isActive) {
        if (!isSameRecruiter(existingCandidate, req.crmUser._id)) {
          throw createHttpError(409, 'Mobile belongs to another deleted CRM record')
        }

        const candidate = await CrmCandidate.findByIdAndUpdate(
          existingCandidate._id,
          { $set: { ...payload, isActive: true } },
          { new: true, runValidators: true }
        )

        return res.status(200).json({
          success: true,
          message: 'CRM candidate restored successfully',
          data: { candidate }
        })
      }

      throw createHttpError(409, getCandidateConflictInfo(existingCandidate, req.crmUser._id).reason)
    }

    const candidate = await CrmCandidate.create(payload)

    return res.status(201).json({
      success: true,
      message: 'CRM candidate created successfully',
      data: { candidate }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to create CRM candidate')
  }
}

const checkImportCandidates = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []

    if (!rows.length) {
      throw createHttpError(400, 'No CRM candidate rows provided')
    }

    if (rows.length > BULK_IMPORT_MAX_ROWS) {
      throw createHttpError(413, `Import check supports up to ${BULK_IMPORT_MAX_ROWS} records at a time`)
    }

    const seenMobiles = new Set()
    const validRows = []
    const failedRows = []
    const skippedRows = []

    rows.forEach((row, index) => {
      const normalized = normalizeBulkCandidateRow(row)
      const rowNumber = normalized.rowNumber || index + 1

      if (normalized.errors.length) {
        failedRows.push({ row: rowNumber, mobileNumber: normalized.payload.mobileNumber, errors: normalized.errors })
        return
      }

      if (seenMobiles.has(normalized.payload.mobileNumber)) {
        skippedRows.push({
          row: rowNumber,
          mobileNumber: normalized.payload.mobileNumber,
          reason: 'Duplicate mobile in this import'
        })
        return
      }

      seenMobiles.add(normalized.payload.mobileNumber)
      validRows.push({
        rowNumber,
        payload: getCandidatePayload(normalized.payload, req.crmUser._id)
      })
    })

    let existingByMobile = new Map()

    if (validRows.length) {
      const existingCandidates = await CrmCandidate.find({
        mobileNumber: { $in: validRows.map((row) => row.payload.mobileNumber) }
      })
        .select('candidateName mobileNumber recruiterId isActive')
        .populate('recruiterId', 'name')
        .lean()

      existingByMobile = new Map(existingCandidates.map((candidate) => [candidate.mobileNumber, candidate]))

      validRows.forEach((row) => {
        const existingCandidate = existingByMobile.get(row.payload.mobileNumber)

        if (existingCandidate) {
          if (!existingCandidate.isActive && isSameRecruiter(existingCandidate, req.crmUser._id)) return

          skippedRows.push({
            row: row.rowNumber,
            mobileNumber: row.payload.mobileNumber,
            ...getCandidateConflictInfo(existingCandidate, req.crmUser._id)
          })
        }
      })
    }

    const blockedRows = new Set([...failedRows, ...skippedRows].map((row) => row.row))
    const readyRows = validRows
      .filter((row) => !blockedRows.has(row.rowNumber))
      .map((row) => ({ row: row.rowNumber, mobileNumber: row.payload.mobileNumber }))
    const restoreRows = validRows
      .map((row) => {
        const existingCandidate = existingByMobile?.get(row.payload.mobileNumber)
        return existingCandidate && !existingCandidate.isActive && isSameRecruiter(existingCandidate, req.crmUser._id)
          ? {
              row: row.rowNumber,
              mobileNumber: row.payload.mobileNumber,
              existingCandidateName: existingCandidate.candidateName,
              reason: 'Deleted CRM record will be restored'
            }
          : null
      })
      .filter(Boolean)

    return res.status(200).json({
      success: true,
      data: {
        readyCount: readyRows.length,
        restoreCount: restoreRows.length,
        skippedCount: skippedRows.length,
        failedCount: failedRows.length,
        readyRows,
        restoreRows,
        skippedRows,
        failedRows
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to check CRM candidates')
  }
}

const bulkImportCandidates = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []

    if (!rows.length) {
      throw createHttpError(400, 'No CRM candidate rows provided')
    }

    if (rows.length > BULK_IMPORT_MAX_ROWS) {
      throw createHttpError(413, `Import supports up to ${BULK_IMPORT_MAX_ROWS} records at a time`)
    }

    const seenMobiles = new Set()
    const validRows = []
    const failedRows = []
    const skippedRows = []
    let failedCount = 0
    let skippedCount = 0

    rows.forEach((row, index) => {
      const normalized = normalizeBulkCandidateRow(row)
      const rowNumber = normalized.rowNumber || index + 1

      if (normalized.errors.length) {
        failedCount += 1
        addLimitedRowReport(failedRows, { row: rowNumber, errors: normalized.errors })
        return
      }

      if (seenMobiles.has(normalized.payload.mobileNumber)) {
        skippedCount += 1
        addLimitedRowReport(skippedRows, {
          row: rowNumber,
          mobileNumber: normalized.payload.mobileNumber,
          reason: 'Duplicate mobile in this import'
        })
        return
      }

      seenMobiles.add(normalized.payload.mobileNumber)
      validRows.push({
        rowNumber,
        payload: getCandidatePayload(normalized.payload, req.crmUser._id)
      })
    })

    if (!validRows.length) {
      return res.status(200).json({
        success: true,
        message: 'No valid CRM candidates to import',
        data: {
          createdCount: 0,
          failedCount,
          skippedCount,
          failedRows,
          skippedRows
        }
      })
    }

    const existingCandidates = await CrmCandidate.find({
      mobileNumber: { $in: validRows.map((row) => row.payload.mobileNumber) }
    })
      .select('candidateName mobileNumber recruiterId isActive')
      .populate('recruiterId', 'name')
      .lean()

    const existingByMobile = new Map(existingCandidates.map((candidate) => [candidate.mobileNumber, candidate]))
    const insertRows = []
    const restoreRows = []

    validRows.forEach((row) => {
      const existingCandidate = existingByMobile.get(row.payload.mobileNumber)

      if (existingCandidate) {
        if (!existingCandidate.isActive) {
          if (!isSameRecruiter(existingCandidate, req.crmUser._id)) {
            skippedCount += 1
            addLimitedRowReport(skippedRows, {
              row: row.rowNumber,
              mobileNumber: row.payload.mobileNumber,
              reason: 'Mobile belongs to another deleted CRM record',
              existingCandidateName: existingCandidate.candidateName
            })
            return
          }

          restoreRows.push({
            ...row,
            candidateId: existingCandidate._id,
            existingCandidateName: existingCandidate.candidateName
          })
          return
        }

        skippedCount += 1
        addLimitedRowReport(skippedRows, {
          row: row.rowNumber,
          mobileNumber: row.payload.mobileNumber,
          ...getCandidateConflictInfo(existingCandidate, req.crmUser._id)
        })
        return
      }

      insertRows.push(row)
    })

    let createdCount = 0
    let insertedCount = 0
    let restoredCount = 0

    if (insertRows.length) {
      try {
        const insertedCandidates = await CrmCandidate.insertMany(
          insertRows.map((row) => row.payload),
          { ordered: false }
        )
        insertedCount = insertedCandidates.length
      } catch (error) {
        if (!Array.isArray(error.writeErrors) || error.writeErrors.length === 0) {
          throw error
        }

        insertedCount = error.insertedDocs?.length || error.result?.insertedCount || error.result?.nInserted || 0
        error.writeErrors.forEach((writeError) => {
          const failedIndex = Number.isInteger(writeError.index)
            ? writeError.index
            : Number.isInteger(writeError.err?.index)
              ? writeError.err.index
              : 0
          const failedRow = insertRows[failedIndex]
          failedCount += 1
          addLimitedRowReport(failedRows, {
            row: failedRow?.rowNumber || failedIndex + 1,
            errors: [writeError.code === 11000 || writeError.err?.code === 11000 ? 'Mobile already exists' : 'Could not import row']
          })
        })
      }
    }

    if (restoreRows.length) {
      const restoreResult = await CrmCandidate.bulkWrite(
        restoreRows.map((row) => ({
          updateOne: {
            filter: { _id: row.candidateId },
            update: { $set: { ...row.payload, isActive: true } },
            runValidators: true
          }
        })),
        { ordered: false }
      )
      restoredCount = restoreResult.modifiedCount || 0
    }

    createdCount = insertedCount + restoredCount

    return res.status(createdCount ? 201 : 200).json({
      success: true,
      message: createdCount ? 'CRM candidates imported successfully' : 'No new CRM candidates imported',
      data: {
        createdCount,
        insertedCount,
        restoredCount,
        failedCount,
        skippedCount,
        failedRows,
        skippedRows
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to import CRM candidates')
  }
}

const listCandidates = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const serialSearchNumber = getSerialSearchNumber(req.query)
    const querySkip = serialSearchNumber ? serialSearchNumber - 1 : skip
    const queryLimit = serialSearchNumber ? 1 : limit
    const match = applyCandidateFilters(req.query, {
      recruiterId: req.crmUser._id,
      isActive: true
    })
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
        { $skip: querySkip },
        { $limit: queryLimit },
        {
          $lookup: {
            from: 'crm_call_logs',
            let: { candidateId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$candidateId', '$$candidateId'] } } },
              { $sort: { calledAt: -1 } },
              { $limit: 1 },
              { $project: { calledAt: 1, status: 1, remark: 1, nextFollowup: 1 } }
            ],
            as: 'latestCall'
          }
        },
        { $addFields: { latestCall: { $arrayElemAt: ['$latestCall', 0] } } },
        {
          $lookup: {
            from: 'crm_users',
            localField: 'recruiterId',
            foreignField: '_id',
            as: 'recruiter'
          }
        },
        {
          $addFields: {
            recruiter: { $arrayElemAt: ['$recruiter', 0] }
          }
        },
        { $project: { __v: 0, 'recruiter.password': 0, 'recruiter.__v': 0 } }
      ])
    ])
    const numberedCandidates = candidates.map((candidate, index) => ({
      ...candidate,
      serialNumber: querySkip + index + 1
    }))

    return res.status(200).json({
      success: true,
      data: {
        candidates: numberedCandidates,
        pagination: serialSearchNumber
          ? {
              total: numberedCandidates.length,
              page: 1,
              limit: queryLimit,
              totalPages: 1,
              sourceTotal: total,
              serialNumber: serialSearchNumber
            }
          : getPaginationMeta(total, page, limit)
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to list CRM candidates')
  }
}

const getCandidate = async (req, res) => {
  try {
    const candidate = await CrmCandidate.findOne({
      _id: req.params.id,
      recruiterId: req.crmUser._id,
      isActive: true
    })
      .populate('recruiterId', 'name email role')
      .lean()

    if (!candidate) {
      throw createHttpError(404, 'CRM candidate not found')
    }

    return res.status(200).json({
      success: true,
      data: { candidate }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to fetch CRM candidate')
  }
}

const updateCandidate = async (req, res) => {
  try {
    const candidate = await findOwnActiveCandidate(req.params.id, req.crmUser._id)
    const payload = getCandidatePayload(req.body, req.crmUser._id)

    Object.assign(candidate, payload)
    await candidate.save()

    return res.status(200).json({
      success: true,
      message: 'CRM candidate updated successfully',
      data: { candidate }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to update CRM candidate')
  }
}

const softDeleteCandidate = async (req, res) => {
  try {
    const match = { _id: req.params.id, isActive: true }

    if (req.crmUser.role !== 'crm_super_admin') {
      match.recruiterId = req.crmUser._id
    }

    const candidate = await CrmCandidate.findOne(match)

    if (!candidate) {
      throw createHttpError(404, 'CRM candidate not found')
    }

    candidate.isActive = false
    await candidate.save()

    return res.status(200).json({
      success: true,
      message: 'CRM candidate deactivated successfully',
      data: { candidateId: candidate._id, isActive: candidate.isActive }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to deactivate CRM candidate')
  }
}

const bulkDeleteCandidates = async (req, res) => {
  try {
    const submittedIds = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id || '').trim()) : []
    const uniqueIds = [...new Set(submittedIds.filter(Boolean))]

    if (!uniqueIds.length) {
      throw createHttpError(400, 'No CRM candidate IDs provided')
    }

    if (uniqueIds.length > BULK_DELETE_MAX_ROWS) {
      throw createHttpError(413, `Delete supports up to ${BULK_DELETE_MAX_ROWS} candidates at a time`)
    }

    if (uniqueIds.some((id) => !OBJECT_ID_PATTERN.test(id))) {
      throw createHttpError(400, 'Invalid CRM candidate ID')
    }

    const match = {
      _id: { $in: uniqueIds },
      isActive: true
    }

    if (req.crmUser.role !== 'crm_super_admin') {
      match.recruiterId = req.crmUser._id
    }

    const result = await CrmCandidate.updateMany(match, { $set: { isActive: false } })
    const deletedCount = result.modifiedCount || 0

    return res.status(200).json({
      success: true,
      message: deletedCount ? 'CRM candidates deactivated successfully' : 'No CRM candidates were deactivated',
      data: {
        deletedCount,
        requestedCount: uniqueIds.length
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to deactivate CRM candidates')
  }
}

const addCallLog = async (req, res) => {
  try {
    const candidate = await findOwnActiveCandidate(req.params.id, req.crmUser._id)
    const callLog = await CrmCallLog.create({
      candidateId: candidate._id,
      recruiterId: req.crmUser._id,
      remark: req.body.remark,
      status: req.body.status,
      nextFollowup: req.body.nextFollowup
    })

    if (candidate.callStatus === 'pending') {
      candidate.callStatus = req.body.status === 'callback' ? 'followup' : 'called'
      await candidate.save()
    } else if (candidate.callStatus === 'called' && req.body.status === 'callback') {
      candidate.callStatus = 'followup'
      await candidate.save()
    }

    return res.status(201).json({
      success: true,
      message: 'CRM call log added successfully',
      data: { callLog, candidate }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to add CRM call log')
  }
}

const getCallLogs = async (req, res) => {
  try {
    const candidate = await findOwnActiveCandidate(req.params.id, req.crmUser._id)
    const { page, limit, skip } = getPagination(req.query)

    const [total, callLogs] = await Promise.all([
      CrmCallLog.countDocuments({ candidateId: candidate._id, recruiterId: req.crmUser._id }),
      CrmCallLog.find({ candidateId: candidate._id, recruiterId: req.crmUser._id })
        .sort({ calledAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ])

    return res.status(200).json({
      success: true,
      data: {
        callLogs,
        pagination: getPaginationMeta(total, page, limit)
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to fetch CRM call logs')
  }
}

const getDashboardStats = async (req, res) => {
  try {
    const match = {
      recruiterId: req.crmUser._id,
      isActive: true
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [candidateTotals, byClassRows, byStatusRows, calledToday] = await Promise.all([
      CrmCandidate.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$callStatus', 'pending'] }, 1, 0] } },
            called: { $sum: { $cond: [{ $eq: ['$callStatus', 'called'] }, 1, 0] } },
            followup: { $sum: { $cond: [{ $eq: ['$callStatus', 'followup'] }, 1, 0] } },
            sure: { $sum: { $cond: [{ $eq: ['$callStatus', 'sure'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$callStatus', 'rejected'] }, 1, 0] } }
          }
        }
      ]),
      CrmCandidate.aggregate([
        { $match: match },
        { $group: { _id: '$candidateClass', count: { $sum: 1 } } }
      ]),
      CrmCandidate.aggregate([
        { $match: match },
        { $group: { _id: '$callStatus', count: { $sum: 1 } } }
      ]),
      CrmCallLog.countDocuments({
        recruiterId: req.crmUser._id,
        calledAt: { $gte: todayStart, $lte: todayEnd }
      })
    ])

    const totals = candidateTotals[0] || {
      total: 0,
      pending: 0,
      called: 0,
      followup: 0,
      sure: 0,
      rejected: 0
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
        total: totals.total,
        called: totals.called,
        pending: totals.pending,
        followup: totals.followup,
        sure: totals.sure,
        rejected: totals.rejected,
        calledToday,
        byClass,
        byStatus
      }
    })
  } catch (error) {
    return sendError(res, error, 'Failed to fetch CRM dashboard stats')
  }
}

module.exports = {
  addCallLog,
  bulkDeleteCandidates,
  bulkImportCandidates,
  checkImportCandidates,
  createCandidate,
  getCallLogs,
  getCandidate,
  getDashboardStats,
  listCandidates,
  softDeleteCandidate,
  updateCandidate
}
