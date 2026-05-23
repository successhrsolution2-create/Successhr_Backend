const Employee = require('../models/Employee')
const OfficeLocation = require('../models/OfficeLocation')
const WorkSchedule = require('../models/WorkSchedule')
const { WORK_DAYS } = require('../config/emsConstants')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { buildSearch, isObjectId, pagination, pick } = require('../utils/emsHelpers')

const scheduleFields = ['employee', 'employeeId', 'officeLocation', 'workDays', 'shiftStart', 'shiftEnd', 'graceMinutes', 'isActive']

const employeeByIdentifier = async (identifier) => {
  if (!identifier) return null
  const query = isObjectId(identifier)
    ? { _id: identifier, isDeleted: false }
    : { employeeId: String(identifier).trim().toUpperCase(), isDeleted: false }
  return Employee.findOne(query)
}

const normalizeSchedulePayload = async (body = {}) => {
  const source = pick(body, scheduleFields)
  const employee = await employeeByIdentifier(source.employee || source.employeeId)
  if (!employee) {
    const error = new Error('Employee not found')
    error.status = 404
    throw error
  }

  const location = await OfficeLocation.findOne({ _id: source.officeLocation, isActive: true })
  if (!location) {
    const error = new Error('Active office location not found')
    error.status = 404
    throw error
  }

  const workDays = Array.isArray(source.workDays) && source.workDays.length
    ? source.workDays.filter((day) => WORK_DAYS.includes(day))
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  return {
    employee: employee._id,
    officeLocation: location._id,
    workDays,
    shiftStart: source.shiftStart || '09:00',
    shiftEnd: source.shiftEnd || '18:00',
    graceMinutes: Number(source.graceMinutes ?? 15),
    isActive: source.isActive !== undefined ? Boolean(source.isActive) : true
  }
}

const listSchedules = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = {}
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true'
  if (req.query.officeLocation) filter.officeLocation = req.query.officeLocation

  let employeeIds = null
  if (req.query.search) {
    const employeeFilter = {
      isDeleted: false,
      ...buildSearch(req.query.search, ['employeeId', 'firstName', 'lastName', 'email'])
    }
    employeeIds = await Employee.find(employeeFilter).distinct('_id')
    filter.employee = { $in: employeeIds }
  }

  const [items, total] = await Promise.all([
    WorkSchedule.find(filter)
      .populate('employee', 'employeeId firstName lastName email designation')
      .populate('officeLocation', 'name address coordinates radius')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    WorkSchedule.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const createSchedule = async (req, res) => {
  const payload = await normalizeSchedulePayload(req.body)
  payload.createdBy = req.emsUser?.id || null

  await WorkSchedule.updateMany({ employee: payload.employee, isActive: true }, { isActive: false, updatedBy: req.emsUser?.id || null })
  const schedule = await WorkSchedule.create(payload)
  await schedule.populate('employee', 'employeeId firstName lastName email')
  await schedule.populate('officeLocation', 'name address coordinates radius')
  res.status(201).json({ message: 'Work schedule assigned', schedule })
}

const updateSchedule = async (req, res) => {
  const payload = await normalizeSchedulePayload(req.body)
  payload.updatedBy = req.emsUser?.id || null
  const schedule = await WorkSchedule.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true
  })
    .populate('employee', 'employeeId firstName lastName email')
    .populate('officeLocation', 'name address coordinates radius')

  if (!schedule) {
    return res.status(404).json({ message: 'Work schedule not found' })
  }

  res.json({ message: 'Work schedule updated', schedule })
}

const deleteSchedule = async (req, res) => {
  const schedule = await WorkSchedule.findByIdAndUpdate(
    req.params.id,
    { isActive: false, updatedBy: req.emsUser?.id || null },
    { new: true }
  )

  if (!schedule) {
    return res.status(404).json({ message: 'Work schedule not found' })
  }

  res.json({ message: 'Work schedule removed' })
}

const employeeSchedule = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.id)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id) && req.emsUser?.role !== 'manager') {
    return res.status(403).json({ message: 'You cannot access this work schedule' })
  }

  const schedule = await WorkSchedule.findOne({ employee: employee._id, isActive: true })
    .populate('employee', 'employeeId firstName lastName email designation')
    .populate('officeLocation', 'name address coordinates radius')
    .sort({ updatedAt: -1 })

  if (!schedule) {
    return res.status(404).json({ message: 'Active work schedule not found' })
  }

  res.json({ employee, schedule })
}

module.exports = {
  createSchedule,
  deleteSchedule,
  employeeSchedule,
  listSchedules,
  updateSchedule
}
