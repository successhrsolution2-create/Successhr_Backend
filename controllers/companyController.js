const Company = require('../models/Company')
const Placement = require('../models/Placement')
const { emitToAdmin, emitToBA } = require('../socket')
const { invalidateCache } = require('../src/utils/invalidateCache')
const { getPagination, pagedResponse, wantsPagination } = require('../utils/pagination')

const populateCompany = (query) => query.populate('submittedBy', 'name email')
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

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

const ensureUniqueCompanyIdentity = async (payload, excludeId) => {
  const checks = [
    { field: 'mobileNo', label: 'mobile number', value: payload.mobileNo },
    { field: 'emailId', label: 'email', value: payload.emailId }
  ].filter((item) => item.value)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await Company.findOne(query).select('_id')
    if (existing) {
      const error = new Error(`A company with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const canAccess = (req, company) => {
  const ownerId = company.submittedBy?._id || company.submittedBy
  return req.user.role === 'superAdmin' || ownerId.toString() === req.user._id.toString()
}

const ownerUserId = (company) => company?.submittedBy?._id || company?.submittedBy

const getCompanies = async (req, res) => {
  const query = req.user.role === 'superAdmin' ? {} : { submittedBy: req.user._id }
  const companiesQuery = Company.find(query)
    .populate('submittedBy', 'name email')
    .sort({ status: 1, priorityOrder: 1, createdAt: -1 })

  if (wantsPagination(req.query)) {
    const { page, limit, skip } = getPagination(req.query)
    const [total, companies] = await Promise.all([
      Company.countDocuments(query),
      companiesQuery.skip(skip).limit(limit)
    ])
    return res.json(pagedResponse({ data: companies, total, page, limit }))
  }

  const companies = await companiesQuery
  res.json(companies)
}

const createCompany = async (req, res) => {
  normalizeCompanyIdentity(req.body)
  await ensureUniqueCompanyIdentity(req.body)

  await Company.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  let company = await Company.create({
    ...req.body,
    submittedBy: req.user._id,
    status: 'not_viewed',
    priorityOrder: 0
  })

  company = await Company.findById(company._id).populate('submittedBy', 'name email')
  emitToAdmin('new_company', company)
  emitToBA(ownerUserId(company), 'company_updated', company)

  invalidateCache('/api/companies').catch(() => {})
  res.status(201).json(company)
}

const getCompanyById = async (req, res) => {
  const company = await populateCompany(Company.findById(req.params.id))

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  if (!canAccess(req, company)) {
    return res.status(403).json({ message: 'You can only access your own references' })
  }

  res.json(company)
}

const updateCompany = async (req, res) => {
  const company = await Company.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  if (!canAccess(req, company)) {
    return res.status(403).json({ message: 'You can only update your own references' })
  }

  const blocked = ['submittedBy', '_id']
  if (req.user.role === 'businessAdvisor') {
    blocked.push('priorityOrder', 'status', 'adminNotes')
  }

  const blockedFieldsSent = Object.keys(req.body || {}).filter((key) => blocked.includes(key))
  if (blockedFieldsSent.length) {
    return res.status(400).json({
      message: `You cannot update these fields: ${blockedFieldsSent.join(', ')}`
    })
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (!blocked.includes(key)) {
      company[key] = value
    }
  })

  normalizeCompanyIdentity(company)
  await ensureUniqueCompanyIdentity(company, company._id)

  await company.save()
  const savedCompany = await Company.findById(company._id).populate('submittedBy', 'name email')

  emitToAdmin('company_updated', savedCompany)
  emitToBA(ownerUserId(savedCompany), 'company_updated', savedCompany)

  invalidateCache('/api/companies').catch(() => {})
  invalidateCache(`/api/companies/${req.params.id}`).catch(() => {})
  res.json(savedCompany)
}

const deleteCompany = async (req, res) => {
  const company = await Company.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  const ownerId = ownerUserId(company)
  const deletedId = company._id.toString()
  const linkedPlacements = await Placement.find({ companyId: company._id }).select('_id baId')

  if (linkedPlacements.length) {
    await Placement.deleteMany({ _id: { $in: linkedPlacements.map((placement) => placement._id) } })
  }

  await company.deleteOne()

  emitToAdmin('company_deleted', { id: deletedId })
  emitToBA(ownerId, 'company_deleted', { id: deletedId })
  linkedPlacements.forEach((placement) => {
    const payload = {
      id: placement._id.toString(),
      companyId: deletedId
    }
    emitToAdmin('placement_deleted', payload)
    emitToBA(placement.baId, 'placement_deleted', payload)
  })

  invalidateCache('/api/companies').catch(() => {})
  invalidateCache(`/api/companies/${req.params.id}`).catch(() => {})
  invalidateCache('/api/placements').catch(() => {})
  invalidateCache('/api/placements/summary').catch(() => {})
  res.json({ message: 'Company reference deleted' })
}

const updateCompanyStatus = async (req, res) => {
  const { status, adminNotes } = req.body
  const company = await Company.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company reference not found' })
  }

  const statusChanged = status && status !== company.status

  if (status) {
    if (!Company.statusValues.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    if (statusChanged) {
      await Company.updateMany({ status }, { $inc: { priorityOrder: 1 } })
      company.priorityOrder = 0
    }

    company.status = status
  }

  if (adminNotes !== undefined) {
    company.adminNotes = adminNotes
  }

  await company.save()

  const savedCompany = await Company.findById(company._id).populate('submittedBy', 'name email')

  emitToAdmin('status_updated', {
    type: 'company',
    id: company._id.toString(),
    status: company.status
  })
  emitToAdmin('company_updated', savedCompany)
  emitToBA(ownerUserId(savedCompany), 'company_updated', savedCompany)

  invalidateCache('/api/companies').catch(() => {})
  invalidateCache(`/api/companies/${req.params.id}`).catch(() => {})
  res.json(savedCompany)
}

const reorderCompanies = async (req, res) => {
  const { orderedIds } = req.body

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ message: 'orderedIds must be an array' })
  }

  await Company.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { priorityOrder: index } }
      }
    }))
  )

  emitToAdmin('reordered', { type: 'company', orderedIds })
  invalidateCache('/api/companies').catch(() => {})
  res.json({ orderedIds })
}

module.exports = {
  getCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  updateCompanyStatus,
  reorderCompanies
}
