const Attendance = require('../models/Attendance')
const Department = require('../models/Department')
const Employee = require('../models/Employee')
const Leave = require('../models/Leave')
const Payroll = require('../models/Payroll')
const { dateRangeFilter, endOfDay, startOfDay } = require('../utils/emsHelpers')

const PRESENT_STATUSES = ['present', 'half_day']
const LEAVE_ATTENDANCE_STATUSES = ['leave', 'on_leave']
const DASHBOARD_TZ = process.env.EMS_TIMEZONE || 'Asia/Kolkata'

const pad = (value) => String(value).padStart(2, '0')
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
const monthLabel = (date) => date.toLocaleString('en', { month: 'short' })
const shortDate = (date) => (date ? new Date(date).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '')
const fullName = (employee = {}) => `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email || 'Employee'
const formatTime = (date) =>
  date ? new Date(date).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'

const normalizeDashboardStatus = (status) => {
  if (status === 'late') return 'late'
  if (LEAVE_ATTENDANCE_STATUSES.includes(status)) return 'on_leave'
  if (PRESENT_STATUSES.includes(status)) return 'present'
  return 'absent'
}

const percentChange = (current, previous) => {
  if (!previous) return current ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

const sameDayPreviousMonth = (date) => {
  const year = date.getFullYear()
  const month = date.getMonth() - 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(date.getDate(), lastDay))
}

const currentWeekdays = (today) => {
  const start = startOfDay(today)
  const mondayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - mondayOffset)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { day, date }
  })
}

const lastSixMonths = (today) =>
  Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1)
    return { key: monthKey(date), month: monthLabel(date), date }
  })

const attendanceSnapshot = async ({ day, activeEmployees }) => {
  const rangeStart = startOfDay(day)
  const rangeEnd = endOfDay(day)
  const [records, leaveEmployeeIds] = await Promise.all([
    Attendance.find({ date: { $gte: rangeStart, $lte: rangeEnd } }).select('employee status').lean(),
    Leave.find({
      status: 'approved',
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart }
    }).distinct('employee')
  ])

  const leaveSet = new Set(leaveEmployeeIds.map(String))
  let present = 0
  let late = 0
  let explicitAbsent = 0

  records.forEach((record) => {
    if (record.status === 'late') late += 1
    else if (PRESENT_STATUSES.includes(record.status)) present += 1
    else if (record.status === 'absent') explicitAbsent += 1
    else if (LEAVE_ATTENDANCE_STATUSES.includes(record.status)) leaveSet.add(String(record.employee))
  })

  const presentToday = present + late
  const onLeave = leaveSet.size
  const absent = Math.max(explicitAbsent, activeEmployees - presentToday - onLeave)

  return { present, late, presentToday, absent, onLeave }
}

const headcount = async (_req, res) => {
  const [departments, employees, totals] = await Promise.all([
    Department.find({ status: 'active' }).sort({ name: 1 }).lean(),
    Employee.aggregate([
      { $match: { isDeleted: false, status: 'active' } },
      { $group: { _id: '$department', total: { $sum: 1 } } }
    ]),
    Employee.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', total: { $sum: 1 } } }
    ])
  ])

  const countMap = new Map(employees.map((item) => [String(item._id || 'unassigned'), item.total]))
  res.json({
    departments: departments.map((department) => ({
      department,
      total: countMap.get(String(department._id)) || 0
    })),
    unassigned: countMap.get('unassigned') || 0,
    totals
  })
}

const dashboard = async (_req, res) => {
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)
  const previousMonthDay = sameDayPreviousMonth(today)
  const previousMonthEnd = endOfDay(previousMonthDay)
  const weekdays = currentWeekdays(today)
  const months = lastSixMonths(today)
  const monthStart = startOfDay(months[0].date)
  const monthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0))

  const [
    activeEmployees,
    previousActiveEmployees,
    departments,
    departmentCounts,
    weeklyRows,
    monthlyRows,
    todayRecords,
    pendingLeaveRows,
    recentJoinRows
  ] = await Promise.all([
    Employee.find({ isDeleted: false, status: 'active' })
      .select('employeeId firstName lastName email designation department dateOfBirth joiningDate createdAt')
      .populate('department', 'name code')
      .lean(),
    Employee.countDocuments({
      isDeleted: false,
      status: 'active',
      createdAt: { $lte: previousMonthEnd }
    }),
    Department.find({ status: 'active' }).select('name code openPositions').sort({ name: 1 }).lean(),
    Employee.aggregate([
      { $match: { isDeleted: false, status: 'active' } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]),
    Attendance.aggregate([
      { $match: { date: { $gte: weekdays[0].date, $lte: endOfDay(weekdays[4].date) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: DASHBOARD_TZ } },
          present: { $sum: { $cond: [{ $in: ['$status', PRESENT_STATUSES] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }
        }
      }
    ]),
    Attendance.aggregate([
      { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: DASHBOARD_TZ } },
          present: { $sum: { $cond: [{ $in: ['$status', [...PRESENT_STATUSES, 'late']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $in: ['$status', LEAVE_ATTENDANCE_STATUSES] }, 1, 0] } }
        }
      }
    ]),
    Attendance.find({ date: { $gte: todayStart, $lte: todayEnd } })
      .populate('employee', 'employeeId firstName lastName email')
      .sort({ 'checkIn.time': -1, updatedAt: -1 })
      .limit(5)
      .lean(),
    Leave.find({ status: { $in: ['pending_manager', 'pending_hr'] } })
      .populate('employee', 'employeeId firstName lastName email')
      .sort({ createdAt: 1 })
      .limit(4)
      .lean(),
    Employee.find({ isDeleted: false, status: 'active' })
      .select('employeeId firstName lastName email designation joiningDate')
      .sort({ joiningDate: -1, createdAt: -1 })
      .limit(4)
      .lean()
  ])

  const [todaySnapshot, previousSnapshot] = await Promise.all([
    attendanceSnapshot({ day: today, activeEmployees: activeEmployees.length }),
    attendanceSnapshot({ day: previousMonthDay, activeEmployees: previousActiveEmployees })
  ])

  const departmentCountMap = new Map(departmentCounts.map((item) => [String(item._id || 'unassigned'), item.count]))
  const departmentHeadcount = departments.map((department) => ({
    name: department.name,
    count: departmentCountMap.get(String(department._id)) || 0
  }))
  const unassigned = departmentCountMap.get('unassigned') || 0
  if (unassigned) departmentHeadcount.push({ name: 'Unassigned', count: unassigned })

  const weeklyMap = new Map(weeklyRows.map((row) => [row._id, row]))
  const weeklyAttendance = weekdays.map(({ day, date }) => {
    const row = weeklyMap.get(dateKey(date)) || {}
    return {
      day,
      present: row.present || 0,
      absent: row.absent || 0,
      late: row.late || 0
    }
  })

  const monthlyMap = new Map(monthlyRows.map((row) => [row._id, row]))
  const monthlyTrend = months.map(({ key, month }) => {
    const row = monthlyMap.get(key) || {}
    return {
      month,
      present: row.present || 0,
      absent: row.absent || 0,
      leave: row.leave || 0
    }
  })

  const openPositions = departments.reduce((sum, department) => sum + Number(department.openPositions || 0), 0)
  const birthdays = activeEmployees
    .filter((employee) => {
      if (!employee.dateOfBirth) return false
      const dob = new Date(employee.dateOfBirth)
      return dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()
    })
    .slice(0, 4)
    .map((employee) => ({
      id: employee._id,
      name: fullName(employee),
      designation: employee.designation || 'Employee'
    }))

  const anniversaries = activeEmployees
    .filter((employee) => {
      if (!employee.joiningDate) return false
      const joiningDate = new Date(employee.joiningDate)
      return (
        joiningDate.getDate() === today.getDate() &&
        joiningDate.getMonth() === today.getMonth() &&
        today.getFullYear() > joiningDate.getFullYear()
      )
    })
    .slice(0, 4)
    .map((employee) => {
      const joiningDate = new Date(employee.joiningDate)
      return {
        id: employee._id,
        name: fullName(employee),
        years: today.getFullYear() - joiningDate.getFullYear()
      }
    })

  res.json({
    kpi: {
      totalEmployees: activeEmployees.length,
      presentToday: todaySnapshot.presentToday,
      absentToday: todaySnapshot.absent,
      onLeave: todaySnapshot.onLeave,
      openPositions
    },
    kpiChange: {
      totalEmployees: percentChange(activeEmployees.length, previousActiveEmployees),
      presentToday: percentChange(todaySnapshot.presentToday, previousSnapshot.presentToday),
      absentToday: percentChange(todaySnapshot.absent, previousSnapshot.absent),
      onLeave: percentChange(todaySnapshot.onLeave, previousSnapshot.onLeave),
      openPositions: 0
    },
    weeklyAttendance,
    departmentHeadcount,
    todayAttendance: todayRecords.map((record) => ({
      id: record._id,
      name: fullName(record.employee),
      checkIn: formatTime(record.checkIn?.time),
      status: normalizeDashboardStatus(record.status)
    })),
    pendingLeaves: pendingLeaveRows.map((leave) => ({
      id: leave._id,
      name: fullName(leave.employee),
      employeeId: leave.employee?.employeeId,
      type: leave.leaveType,
      days: leave.totalDays,
      from: shortDate(leave.startDate),
      status: leave.status
    })),
    recentJoins: recentJoinRows.map((employee) => ({
      id: employee._id,
      name: fullName(employee),
      designation: employee.designation || 'Employee',
      joinedOn: shortDate(employee.joiningDate)
    })),
    birthdays,
    anniversaries,
    monthlyTrend
  })
}

const attendanceSummary = async (req, res) => {
  const filter = dateRangeFilter(req.query)
  if (!Object.keys(filter).length) {
    filter.date = { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) }
  }

  const [byStatus, byDay] = await Promise.all([
    Attendance.aggregate([{ $match: filter }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    Attendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ])

  res.json({ byStatus, byDay })
}

const leaveSummary = async (req, res) => {
  const filter = dateRangeFilter(req.query, 'startDate')
  const [byStatus, byType] = await Promise.all([
    Leave.aggregate([{ $match: filter }, { $group: { _id: '$status', total: { $sum: 1 }, days: { $sum: '$totalDays' } } }]),
    Leave.aggregate([{ $match: filter }, { $group: { _id: '$leaveType', total: { $sum: 1 }, days: { $sum: '$totalDays' } } }])
  ])
  res.json({ byStatus, byType })
}

const payrollSummary = async (req, res) => {
  const filter = {}
  if (req.query.month) filter.month = Number(req.query.month)
  if (req.query.year) filter.year = Number(req.query.year)
  if (req.query.status) filter.status = req.query.status

  const summary = await Payroll.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        totalRuns: { $sum: 1 },
        grossPay: { $sum: '$grossPay' },
        deductions: { $sum: '$totalDeductions' },
        netPay: { $sum: '$netPay' }
      }
    }
  ])

  res.json({ summary })
}

module.exports = {
  attendanceSummary,
  dashboard,
  headcount,
  leaveSummary,
  payrollSummary
}
