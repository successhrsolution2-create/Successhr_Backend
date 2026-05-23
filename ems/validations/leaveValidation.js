const { LEAVE_TYPES } = require('../config/emsConstants')
const { calculateLeaveDays, safeText } = require('../utils/emsHelpers')

const normalizeLeavePayload = (body = {}, fallbackEmployeeId = null) => {
  const errors = []
  const employee = body.employeeId || body.employee || fallbackEmployeeId
  const leaveType = body.leaveType || body.type
  const startDate = body.startDate
  const endDate = body.endDate
  const reason = safeText(body.reason)
  const totalDays = calculateLeaveDays(startDate, endDate)

  if (!employee) errors.push('Employee is required')
  if (!LEAVE_TYPES.includes(leaveType)) errors.push('Leave type is invalid')
  if (!startDate) errors.push('Start date is required')
  if (!endDate) errors.push('End date is required')
  if (!totalDays) errors.push('End date must be after start date')
  if (!reason) errors.push('Reason is required')

  return {
    payload: {
      employee,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason
    },
    errors
  }
}

module.exports = { normalizeLeavePayload }
