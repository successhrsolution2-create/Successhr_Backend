const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r']
const MAX_CELL_LENGTH = 1000

const sanitizeCell = (value) => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value

  let sanitized = String(value).trim().split(String.fromCharCode(0)).join('')

  if (DANGEROUS_PREFIXES.some((prefix) => sanitized.startsWith(prefix))) {
    sanitized = `'${sanitized}`
  }

  if (sanitized.length > MAX_CELL_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_CELL_LENGTH)}...`
  }

  return sanitized
}

const sanitizeRow = (rowObject = {}) =>
  Object.entries(rowObject).reduce((row, [key, value]) => {
    row[key] = sanitizeCell(value)
    return row
  }, {})

function formatDate(dateValue) {
  if (!dateValue) return ''

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

module.exports = { sanitizeCell, sanitizeRow, formatDate }
