const MAX_RANGE_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

const parseIsoDate = (value) => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null

  const date = new Date(`${trimmed}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const toIsoDateString = (date) => date.toISOString().slice(0, 10)

const validateDateRange = ({ fromDate: rawFromDate, toDate: rawToDate }) => {
  const fromDate = parseIsoDate(rawFromDate)
  const toDate = parseIsoDate(rawToDate)
  const today = new Date()
  today.setUTCHours(23, 59, 59, 999)

  if (!fromDate) {
    return { valid: false, message: 'fromDate must be a valid ISO date in YYYY-MM-DD format' }
  }

  if (!toDate) {
    return { valid: false, message: 'toDate must be a valid ISO date in YYYY-MM-DD format' }
  }

  if (fromDate > today || toDate > today) {
    return { valid: false, message: 'Date range cannot be in the future' }
  }

  if (toDate < fromDate) {
    return { valid: false, message: 'toDate must be greater than or equal to fromDate' }
  }

  const rangeDays = Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1
  if (rangeDays > MAX_RANGE_DAYS) {
    return { valid: false, message: 'Max export range is 1 year' }
  }

  return {
    valid: true,
    fromDate,
    toDate,
    fromDateString: toIsoDateString(fromDate),
    toDateString: toIsoDateString(toDate),
    rangeDays
  }
}

module.exports = {
  MAX_RANGE_DAYS,
  parseIsoDate,
  toIsoDateString,
  validateDateRange
}
