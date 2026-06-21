const CompanyAdmin = require('../models/companyManagement/CompanyAdmin')
const CrmUser = require('../crm/models/CrmUser.model')
const Employee = require('../ems/models/Employee')
const User = require('../models/User')

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const normalizeEmployeeId = (employeeId) => String(employeeId || '').trim().toUpperCase()
const sameId = (left, right) => String(left || '') === String(right || '')
const isExcludedId = (recordId, excluded) => {
  if (Array.isArray(excluded)) {
    return excluded.some((item) => sameId(recordId, item))
  }

  return sameId(recordId, excluded)
}

const accountLabels = {
  companyAdmin: 'Company Admin',
  crmUser: 'CRM',
  employee: 'Success Employee',
  user: 'Success HR'
}

const conflictMessage = (field, source, role) => {
  const label = accountLabels[source] || 'another'
  const roleText = role ? ` ${role}` : ''
  return `This ${field} is already used by a${/^[aeiou]/i.test(label) ? 'n' : ''} ${label}${roleText} login`
}

const findLoginIdentityConflicts = async ({ email, employeeId, exclude = {} } = {}) => {
  const normalizedEmail = normalizeEmail(email)
  const normalizedEmployeeId = normalizeEmployeeId(employeeId)
  const conflicts = []

  const queries = []
  if (normalizedEmail) {
    queries.push(
      User.findOne({ email: normalizedEmail }).select('_id role').lean().then((record) => ({ source: 'user', field: 'email', record })),
      CompanyAdmin.findOne({ email: normalizedEmail }).select('_id').lean().then((record) => ({ source: 'companyAdmin', field: 'email', record })),
      CrmUser.findOne({ email: normalizedEmail }).select('_id role').lean().then((record) => ({ source: 'crmUser', field: 'email', record })),
      Employee.findOne({ email: normalizedEmail, isDeleted: false }).select('_id role').lean().then((record) => ({ source: 'employee', field: 'email', record }))
    )
  }

  if (normalizedEmployeeId) {
    queries.push(
      User.findOne({ employeeId: normalizedEmployeeId }).select('_id role').lean().then((record) => ({ source: 'user', field: 'employee ID', record })),
      CrmUser.findOne({ employeeId: normalizedEmployeeId }).select('_id role').lean().then((record) => ({ source: 'crmUser', field: 'employee ID', record })),
      Employee.findOne({ employeeId: normalizedEmployeeId, isDeleted: false }).select('_id role').lean().then((record) => ({ source: 'employee', field: 'employee ID', record }))
    )
  }

  const results = await Promise.all(queries)
  results.forEach(({ source, field, record }) => {
    if (!record) return
    if (exclude[source] && isExcludedId(record._id, exclude[source])) return
    conflicts.push({
      source,
      field,
      record,
      message: conflictMessage(field, source, record.role)
    })
  })

  return conflicts
}

const ensureLoginIdentityAvailable = async (identity, options = {}) => {
  const conflicts = await findLoginIdentityConflicts({ ...identity, exclude: options.exclude })
  if (!conflicts.length) return null

  const error = new Error(conflicts[0].message)
  error.statusCode = 409
  error.conflicts = conflicts
  throw error
}

module.exports = {
  ensureLoginIdentityAvailable,
  findLoginIdentityConflicts,
  normalizeEmail,
  normalizeEmployeeId
}
