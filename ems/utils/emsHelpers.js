const mongoose = require('mongoose')

const Employee = require('../models/Employee')

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const pagination = (query = {}) => {
  const page = toInt(query.page, 1)
  const limit = Math.min(toInt(query.limit, 20), 100)
  return {
    page,
    limit,
    skip: (page - 1) * limit
  }
}

const pick = (source = {}, keys = []) =>
  keys.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      result[key] = source[key]
    }
    return result
  }, {})

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''))

const startOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const endOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

const dateRangeFilter = (query = {}, field = 'date') => {
  const range = {}
  if (query.from) range.$gte = startOfDay(query.from)
  if (query.to) range.$lte = endOfDay(query.to)
  return Object.keys(range).length ? { [field]: range } : {}
}

const calculateLeaveDays = (startDate, endDate) => {
  const start = startOfDay(startDate)
  const end = startOfDay(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

const getNextEmployeeId = async () => {
  const latest = await Employee.findOne({ employeeId: /^EMS\d+$/ }).sort({ employeeId: -1 }).select('employeeId').lean()
  const nextNumber = latest?.employeeId ? Number.parseInt(latest.employeeId.replace('EMS', ''), 10) + 1 : 1
  return `EMS${String(Number.isFinite(nextNumber) ? nextNumber : 1).padStart(3, '0')}`
}

const numberValue = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const money = (value) => Math.round(numberValue(value) * 100) / 100

const csvEscape = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const toCsv = (rows, columns) => {
  const header = columns.map((column) => csvEscape(column.header)).join(',')
  const body = rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(',')).join('\n')
  return [header, body].filter(Boolean).join('\n')
}

const sendCsv = (res, filename, content) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(content)
}

const safeText = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)

const buildSearch = (query, fields) => {
  const search = safeText(query)
  if (!search) return {}
  const regex = new RegExp(escapeRegex(search), 'i')
  return { $or: fields.map((field) => ({ [field]: regex })) }
}

module.exports = {
  buildSearch,
  calculateLeaveDays,
  dateRangeFilter,
  endOfDay,
  getNextEmployeeId,
  isObjectId,
  money,
  numberValue,
  pagination,
  pick,
  safeText,
  sendCsv,
  startOfDay,
  toCsv
}
