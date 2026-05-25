const Attendance = require('../models/Attendance')
const Employee = require('../models/Employee')
const WorkSchedule = require('../models/WorkSchedule')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { assertInsideGeofence } = require('../middleware/emsGeoCheck')
const {
  dateRangeFilter,
  endOfDay,
  isObjectId,
  pagination,
  safeText,
  startOfDay
} = require('../utils/emsHelpers')
const { normalizeCoordinates } = require('../utils/emsGeoUtils')

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const employeeByIdentifier = async (identifier) => {
  if (!identifier) return null
  const query = isObjectId(identifier)
    ? { _id: identifier, isDeleted: false }
    : { employeeId: String(identifier).trim().toUpperCase(), isDeleted: false }
  return Employee.findOne(query)
}

const requestedEmployee = async (req) => {
  if (req.emsUser?.source === 'ems_employee' && req.emsUser?.role === 'employee') {
    return employeeByIdentifier(req.emsUser.id)
  }

  const identifier = req.body?.employeeId || req.body?.employee || req.params?.employeeId || req.params?.id || req.emsUser?.id
  return employeeByIdentifier(identifier)
}

const requestedSelfServiceEmployee = async (req) => {
  if (req.emsUser?.source !== 'ems_employee' || req.emsUser?.role !== 'employee') {
    const error = new Error('Only employees can use check-in and check-out')
    error.status = 403
    throw error
  }

  return employeeByIdentifier(req.emsUser.id)
}

const getActiveSchedule = (employeeId) =>
  WorkSchedule.findOne({ employee: employeeId, isActive: true })
    .populate('officeLocation', 'name address coordinates radius isActive')
    .sort({ updatedAt: -1 })

const timeOnDate = (date, hhmm) => {
  const [hours, minutes] = String(hhmm || '00:00').split(':').map((item) => Number.parseInt(item, 10))
  const value = new Date(date)
  value.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return value
}

const evaluateSchedule = (schedule, timestamp) => {
  const dayName = dayNames[timestamp.getDay()]
  const workDays = schedule?.workDays?.length ? schedule.workDays : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const shiftStart = timeOnDate(timestamp, schedule?.shiftStart || '09:00')
  const shiftEnd = timeOnDate(timestamp, schedule?.shiftEnd || '18:00')
  const graceMinutes = Number(schedule?.graceMinutes || 0)
  const lateAfter = new Date(shiftStart.getTime() + graceMinutes * 60000)
  const lateByMinutes = Math.max(0, Math.round((timestamp.getTime() - lateAfter.getTime()) / 60000))

  return {
    dayName,
    isWorkday: workDays.includes(dayName),
    shiftStart,
    shiftEnd,
    isLate: lateByMinutes > 0,
    lateByMinutes
  }
}

const formatAttendance = (attendance) => attendance

const ensureAttendanceAccess = (req, employeeId) => {
  if (canAccessEmployee(req, employeeId) || req.emsUser?.role === 'manager') return null
  const error = new Error('You cannot access this attendance record')
  error.status = 403
  return error
}

const checkIn = async (req, res) => {
  let employee
  try {
    employee = await requestedSelfServiceEmployee(req)
  } catch (error) {
    return res.status(error.status || 403).json({ message: error.message })
  }

  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const accessError = ensureAttendanceAccess(req, employee._id)
  if (accessError) {
    return res.status(accessError.status).json({ message: accessError.message })
  }

  const coordinates = normalizeCoordinates(req.body)
  if (!coordinates) {
    return res.status(400).json({ message: 'Latitude and longitude are required' })
  }

  const schedule = await getActiveSchedule(employee._id)
  if (!schedule?.officeLocation || !schedule.officeLocation.isActive) {
    return res.status(409).json({ message: 'No active work schedule and office location assigned' })
  }

  const checkInAt = req.body?.timestamp ? new Date(req.body.timestamp) : req.body?.checkIn ? new Date(req.body.checkIn) : new Date()
  const scheduleState = evaluateSchedule(schedule, checkInAt)
  if (!scheduleState.isWorkday) {
    return res.status(403).json({ message: `Today is not a scheduled workday (${scheduleState.dayName})` })
  }

  const geofence = assertInsideGeofence({ coordinates, officeLocation: schedule.officeLocation })
  if (!geofence.inside) {
    return res.status(403).json({
      message: 'Not at assigned office location',
      distance: geofence.distance,
      radius: schedule.officeLocation.radius,
      officeLocation: schedule.officeLocation
    })
  }

  const date = startOfDay(checkInAt)
  const existing = await Attendance.findOne({ employee: employee._id, date })
  if (existing?.checkIn?.time) {
    return res.status(409).json({ message: 'Already checked in today', attendance: existing })
  }

  const attendance = await Attendance.findOneAndUpdate(
    { employee: employee._id, date },
    {
      $setOnInsert: { employee: employee._id, date },
      $set: {
        officeLocation: schedule.officeLocation._id,
        checkIn: {
          time: checkInAt,
          coordinates,
          distanceFromOffice: geofence.distance
        },
        status: scheduleState.isLate ? 'late' : 'present',
        isLate: scheduleState.isLate,
        lateByMinutes: scheduleState.lateByMinutes,
        notes: safeText(req.body?.notes)
      }
    },
    { new: true, upsert: true, runValidators: true }
  )
    .populate('employee', 'employeeId firstName lastName email department')
    .populate('officeLocation', 'name address coordinates radius')

  res.status(201).json({
    message: 'Checked in',
    attendance: formatAttendance(attendance),
    schedule,
    geofence: { distance: geofence.distance, inside: geofence.inside }
  })
}

const checkOut = async (req, res) => {
  let employee
  try {
    employee = await requestedSelfServiceEmployee(req)
  } catch (error) {
    return res.status(error.status || 403).json({ message: error.message })
  }

  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const accessError = ensureAttendanceAccess(req, employee._id)
  if (accessError) {
    return res.status(accessError.status).json({ message: accessError.message })
  }

  const checkOutAt = req.body?.timestamp ? new Date(req.body.timestamp) : req.body?.checkOut ? new Date(req.body.checkOut) : new Date()
  const date = startOfDay(checkOutAt)
  const attendance = await Attendance.findOne({ employee: employee._id, date }).populate('officeLocation', 'name address coordinates radius isActive')

  if (!attendance?.checkIn?.time) {
    return res.status(404).json({ message: 'Check-in record not found for today' })
  }

  if (attendance.checkOut?.time) {
    return res.status(409).json({ message: 'Already checked out today', attendance })
  }

  const coordinates = normalizeCoordinates(req.body)
  const strictCheckout = process.env.EMS_CHECKOUT_LOCATION_STRICT === 'true'
  let geofence = null

  if (coordinates && attendance.officeLocation) {
    geofence = assertInsideGeofence({ coordinates, officeLocation: attendance.officeLocation })
    if (strictCheckout && !geofence.inside) {
      return res.status(403).json({
        message: 'Not at assigned office location',
        distance: geofence.distance,
        radius: attendance.officeLocation.radius
      })
    }
  } else if (strictCheckout) {
    return res.status(400).json({ message: 'Latitude and longitude are required for check-out' })
  }

  const minutesWorked = Math.max(0, Math.round((checkOutAt.getTime() - attendance.checkIn.time.getTime()) / 60000))
  attendance.checkOut = {
    time: checkOutAt,
    coordinates: coordinates || undefined,
    distanceFromOffice: geofence?.distance
  }
  attendance.minutesWorked = minutesWorked
  attendance.workingHours = Math.round((minutesWorked / 60) * 100) / 100

  const minFullDayMinutes = Number(process.env.EMS_FULL_DAY_MINUTES || 480)
  const minHalfDayMinutes = Number(process.env.EMS_HALF_DAY_MINUTES || 240)
  if (minutesWorked < minHalfDayMinutes) attendance.status = 'absent'
  else if (minutesWorked < minFullDayMinutes) attendance.status = 'half_day'
  else if (attendance.isLate) attendance.status = 'late'
  else attendance.status = 'present'

  await attendance.save()

  await attendance.populate('employee', 'employeeId firstName lastName email department')
  res.json({
    message: 'Checked out',
    attendance: formatAttendance(attendance),
    geofence
  })
}

const today = async (_req, res) => {
  const date = startOfDay(new Date())
  const [employees, records] = await Promise.all([
    Employee.find({ isDeleted: false, status: 'active' }).populate('department', 'name code').sort({ firstName: 1 }).lean(),
    Attendance.find({ date: { $gte: date, $lte: endOfDay(date) } }).populate('officeLocation', 'name').lean()
  ])
  const recordMap = new Map(records.map((record) => [String(record.employee), record]))

  res.json({
    date,
    items: employees.map((employee) => ({
      employee,
      attendance: recordMap.get(String(employee._id)) || {
        employee: employee._id,
        date,
        status: 'absent'
      }
    }))
  })
}

const todayForEmployee = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.employeeId)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const accessError = ensureAttendanceAccess(req, employee._id)
  if (accessError) {
    return res.status(accessError.status).json({ message: accessError.message })
  }

  const date = startOfDay(new Date())
  const attendance = await Attendance.findOne({ employee: employee._id, date })
    .populate('officeLocation', 'name address coordinates radius')
    .lean()
  const schedule = await getActiveSchedule(employee._id)

  res.json({
    employee,
    attendance: attendance || { employee: employee._id, date, status: 'absent' },
    schedule
  })
}

const currentStatus = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.employeeId)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const accessError = ensureAttendanceAccess(req, employee._id)
  if (accessError) {
    return res.status(accessError.status).json({ message: accessError.message })
  }

  const date = startOfDay(new Date())
  const attendance = await Attendance.findOne({ employee: employee._id, date })
    .populate('officeLocation', 'name address coordinates radius')
    .lean()
  const schedule = await getActiveSchedule(employee._id)

  res.json({
    employee,
    schedule,
    status: attendance?.checkOut?.time ? 'checked_out' : attendance?.checkIn?.time ? 'checked_in' : 'not_checked_in',
    attendance: attendance || null
  })
}

const employeeAttendance = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.id)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  const accessError = ensureAttendanceAccess(req, employee._id)
  if (accessError) {
    return res.status(accessError.status).json({ message: accessError.message })
  }

  const { page, limit, skip } = pagination(req.query)
  const filter = { employee: employee._id }
  if (req.query.month && req.query.year) {
    const start = new Date(Number(req.query.year), Number(req.query.month) - 1, 1)
    const end = new Date(Number(req.query.year), Number(req.query.month), 0, 23, 59, 59, 999)
    filter.date = { $gte: start, $lte: end }
  } else {
    Object.assign(filter, dateRangeFilter(req.query))
  }

  const [items, total] = await Promise.all([
    Attendance.find(filter)
      .populate('officeLocation', 'name address coordinates radius')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Attendance.countDocuments(filter)
  ])

  res.json({
    employee,
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const allAttendance = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = {}
  if (req.query.date) filter.date = { $gte: startOfDay(req.query.date), $lte: endOfDay(req.query.date) }
  if (req.query.officeLocation) filter.officeLocation = req.query.officeLocation
  if (req.query.status) filter.status = req.query.status

  let employeeIds = null
  if (req.query.dept) {
    employeeIds = await Employee.find({ department: req.query.dept, isDeleted: false }).distinct('_id')
    filter.employee = { $in: employeeIds }
  }

  const [items, total] = await Promise.all([
    Attendance.find(filter)
      .populate({ path: 'employee', select: 'employeeId firstName lastName email department', populate: { path: 'department', select: 'name code' } })
      .populate('officeLocation', 'name address coordinates radius')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const report = async (req, res) => {
  const filter = dateRangeFilter(req.query)
  if (req.query.status) filter.status = req.query.status
  if (req.query.officeLocation) filter.officeLocation = req.query.officeLocation
  if (req.query.employeeId) {
    const employee = await employeeByIdentifier(req.query.employeeId)
    if (employee) filter.employee = employee._id
  }

  const { page, limit, skip } = pagination(req.query)
  const [items, total, summary] = await Promise.all([
    Attendance.find(filter)
      .populate({ path: 'employee', select: 'employeeId firstName lastName email department', populate: { path: 'department', select: 'name code' } })
      .populate('officeLocation', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
    Attendance.aggregate([
      { $match: filter },
      { $group: { _id: '$status', total: { $sum: 1 }, minutesWorked: { $sum: '$minutesWorked' }, workingHours: { $sum: '$workingHours' } } }
    ])
  ])

  res.json({
    items,
    summary,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const overrideAttendance = async (req, res) => {
  const attendance = await Attendance.findById(req.params.id)
  if (!attendance) {
    return res.status(404).json({ message: 'Attendance record not found' })
  }

  const updates = ['date', 'status', 'minutesWorked', 'workingHours', 'lateByMinutes', 'earlyExitMinutes', 'notes']
  updates.forEach((key) => {
    if (req.body[key] !== undefined) attendance[key] = req.body[key]
  })

  if (req.body.checkIn) {
    attendance.checkIn = {
      ...(attendance.checkIn?.toObject?.() || attendance.checkIn || {}),
      time: req.body.checkIn
    }
  }
  if (req.body.checkOut) {
    attendance.checkOut = {
      ...(attendance.checkOut?.toObject?.() || attendance.checkOut || {}),
      time: req.body.checkOut
    }
  }

  attendance.isOverride = true
  attendance.overrideReason = safeText(req.body.reason || req.body.overrideReason)
  attendance.overrideBy = req.emsUser?.id || null
  attendance.overrideAt = new Date()
  await attendance.save()

  await attendance.populate('employee', 'employeeId firstName lastName email department')
  await attendance.populate('officeLocation', 'name address coordinates radius')
  res.json({ message: 'Attendance overridden', attendance })
}

module.exports = {
  allAttendance,
  checkIn,
  checkOut,
  currentStatus,
  employeeAttendance,
  overrideAttendance,
  report,
  today,
  todayForEmployee
}
