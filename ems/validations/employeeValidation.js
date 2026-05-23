const { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMS_ROLES } = require('../config/emsConstants')
const { numberValue, pick, safeText } = require('../utils/emsHelpers')

const normalizeAddress = (address = {}) => pick(address, ['line1', 'line2', 'city', 'state', 'country', 'postalCode'])

const normalizeSalary = (salary = {}) => ({
  basic: numberValue(salary.basic),
  hra: numberValue(salary.hra),
  da: numberValue(salary.da),
  allowances: numberValue(salary.allowances),
  pf: numberValue(salary.pf),
  tds: numberValue(salary.tds),
  bankName: safeText(salary.bankName),
  accountNumber: safeText(salary.accountNumber),
  ifscCode: safeText(salary.ifscCode).toUpperCase()
})

const normalizeEmployeePayload = (body = {}, { partial = false } = {}) => {
  const payload = {}
  const errors = []

  const setText = (key, required = false) => {
    if (body[key] === undefined) {
      if (!partial && required) errors.push(`${key} is required`)
      return
    }
    const value = safeText(body[key])
    if (required && !value) errors.push(`${key} is required`)
    payload[key] = value
  }

  setText('firstName', true)
  setText('lastName', true)
  setText('email', true)
  setText('phone')
  setText('designation')
  setText('workLocation')
  setText('gender')

  if (body.employeeId !== undefined) payload.employeeId = safeText(body.employeeId).toUpperCase()
  if (body.dateOfBirth !== undefined) payload.dateOfBirth = body.dateOfBirth || null
  if (body.joiningDate !== undefined) payload.joiningDate = body.joiningDate || null
  if (body.exitDate !== undefined) payload.exitDate = body.exitDate || null
  if (body.department !== undefined) payload.department = body.department || null
  if (body.manager !== undefined) payload.manager = body.manager || null
  if (body.password !== undefined) payload.password = String(body.password || '')
  if (body.address !== undefined) payload.address = normalizeAddress(body.address)
  if (body.salary !== undefined) payload.salary = normalizeSalary(body.salary)
  if (body.emergencyContact !== undefined) payload.emergencyContact = pick(body.emergencyContact, ['name', 'relation', 'phone'])

  if (body.employmentType !== undefined) {
    if (!EMPLOYMENT_TYPES.includes(body.employmentType)) errors.push('Invalid employment type')
    payload.employmentType = body.employmentType
  }

  if (body.status !== undefined) {
    if (!EMPLOYEE_STATUSES.includes(body.status)) errors.push('Invalid employee status')
    payload.status = body.status
  }

  if (body.role !== undefined) {
    if (!EMS_ROLES.includes(body.role)) errors.push('Invalid EMS role')
    payload.role = body.role
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('Email must be valid')
  }

  return { payload, errors }
}

module.exports = { normalizeEmployeePayload }
