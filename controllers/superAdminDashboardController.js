const BusinessAdvisor = require('../models/BusinessAdvisor')
const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const Company = require('../models/Company')
const Placement = require('../models/Placement')
const User = require('../models/User')
const CrmCallLog = require('../crm/models/CrmCallLog.model')
const CrmCandidate = require('../crm/models/CrmCandidate.model')
const CrmUser = require('../crm/models/CrmUser.model')
const Attendance = require('../ems/models/Attendance')
const Department = require('../ems/models/Department')
const Employee = require('../ems/models/Employee')
const Leave = require('../ems/models/Leave')
const Payroll = require('../ems/models/Payroll')

const pad = (value) => String(value).padStart(2, '0')
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
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
const monthLabel = (date) => date.toLocaleString('en', { month: 'short' })
const lastSixMonths = (today) =>
  Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1)
    return { key: monthKey(date), month: monthLabel(date), date }
  })
const currentWeekdays = (today) => {
  const monday = startOfDay(today)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { day, date }
  })
}
const fullName = (employee = {}) => `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.name || employee.email || 'Employee'
const formatTime = (date) => (date ? new Date(date).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true }) : '')
const relativeTime = (date) => {
  const diffSeconds = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000))
  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const compactText = (...values) =>
  values.map((value) => String(value || '').trim()).find(Boolean) || ''

const userDisplayName = (user = {}) =>
  compactText(user.name, user.email, user.advisorCode)

const cmsCandidateLogSource = (candidate = {}) => {
  if (candidate.source === 'public_form' && candidate.intakeType === 'advisor') {
    return { type: 'candidate_apply_ba', label: 'Candidate Apply via BA' }
  }

  if (candidate.source === 'public_form') {
    return { type: 'candidate_apply', label: 'Candidate Apply Form' }
  }

  if (candidate.intakeType === 'advisor' || candidate.sourceCandidateId) {
    return { type: 'business_advisor', label: 'Business Advisor' }
  }

  return { type: 'cms', label: 'CMS' }
}

const cmsCandidateAddedBy = (candidate = {}, sourceType) => {
  if (sourceType === 'candidate_apply') return 'Candidate Apply Form'
  if (sourceType === 'candidate_apply_ba' || sourceType === 'business_advisor') {
    return compactText(candidate.referenceName, userDisplayName(candidate.advisor), userDisplayName(candidate.createdBy), 'Business Advisor')
  }
  return compactText(userDisplayName(candidate.createdBy), 'Super Admin')
}

const mapCmsCandidateLog = (candidate = {}) => {
  const source = cmsCandidateLogSource(candidate)
  const createdAt = candidate.createdAt || new Date()

  return {
    id: `cms-${candidate._id}`,
    recordType: 'cms',
    candidateId: String(candidate._id || ''),
    sourceCandidateId: candidate.sourceCandidateId ? String(candidate.sourceCandidateId) : '',
    candidateCode: candidate.candidateCode || '',
    candidateName: compactText(candidate.fullName, 'Unnamed candidate'),
    mobileNumber: candidate.mobileNumber || '',
    emailId: candidate.emailId || '',
    profile: compactText(candidate.appliedFor, candidate.currentDesignation, candidate.interestedDepartment),
    sourceType: source.type,
    sourceLabel: source.label,
    addedBy: cmsCandidateAddedBy(candidate, source.type),
    createdAt,
    time: relativeTime(createdAt),
    route: `/admin/cms/candidates/${candidate._id}`
  }
}

const mapAdvisorCandidateLog = (candidate = {}) => {
  const createdAt = candidate.createdAt || new Date()
  const isPublicForm = candidate.source === 'public_form'

  return {
    id: `candidate-${candidate._id}`,
    recordType: 'candidate',
    candidateId: String(candidate._id || ''),
    sourceCandidateId: '',
    candidateCode: '',
    candidateName: compactText(candidate.candidateName, 'Unnamed candidate'),
    mobileNumber: candidate.mobileNumber || '',
    emailId: candidate.emailId || '',
    profile: compactText(candidate.appliedFor, candidate.jobProfile),
    sourceType: isPublicForm ? 'candidate_apply_ba' : 'business_advisor',
    sourceLabel: isPublicForm ? 'Candidate Apply via BA' : 'Business Advisor',
    addedBy: compactText(userDisplayName(candidate.submittedBy), 'Business Advisor'),
    createdAt,
    time: relativeTime(createdAt),
    route: '/admin/references'
  }
}

const buildRecentCandidateLogs = (cmsCandidates = [], advisorCandidates = []) => {
  const linkedCandidateIds = new Set(
    cmsCandidates
      .map((candidate) => candidate.sourceCandidateId)
      .filter(Boolean)
      .map((id) => String(id))
  )

  return [
    ...cmsCandidates.map(mapCmsCandidateLog),
    ...advisorCandidates
      .filter((candidate) => !linkedCandidateIds.has(String(candidate._id || '')))
      .map(mapAdvisorCandidateLog)
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12)
}

const payrollPendingDepartments = async ({ month, year, activeEmployees }) => {
  if (!activeEmployees.length) return 0
  const payrollEmployeeIds = await Payroll.find({ month, year }).distinct('employee')
  const paidSet = new Set(payrollEmployeeIds.map(String))
  const departmentSet = new Set()

  activeEmployees.forEach((employee) => {
    if (!paidSet.has(String(employee._id))) {
      departmentSet.add(String(employee.department || 'unassigned'))
    }
  })

  return departmentSet.size
}

const dashboardSummary = async (_req, res) => {
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)
  const week = currentWeekdays(today)
  const months = lastSixMonths(today)
  const monthStart = startOfDay(months[0].date)
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  const [
    totalAdvisors,
    activeCompanies,
    advisorProfiles,
    placements,
    advisorCandidatesNew,
    recentCandidates,
    recentCompanies,
    recentPlacements,
    totalCrmCandidates,
    successEmployees,
    callsToday,
    crmPipelineRows,
    crmFollowupsDue,
    recentCrmCandidates,
    activeEmployees,
    departments,
    todayAttendance,
    weeklyRows,
    approvedLeavesToday,
    pendingLeaves,
    recentLeaves,
    totalCmsCandidates,
    todayCmsCandidates,
    recentCmsCandidates,
    recentSourceCandidates,
    latest10Candidates
  ] = await Promise.all([
    User.countDocuments({ role: 'businessAdvisor', isActive: true }),
    Company.countDocuments({ status: { $in: ['in_review', 'priority', 'done'] } }),
    BusinessAdvisor.find({}).select('userId fullName').populate('userId', 'name').lean(),
    Placement.find({}).select('baId earningAmount earningStatus earningPaidDate createdAt updatedAt').populate('baId', 'name').lean(),
    Candidate.countDocuments({ status: 'not_viewed' }),
    Candidate.find({}).select('candidateName status createdAt submittedBy').populate('submittedBy', 'name').sort({ createdAt: -1 }).limit(4).lean(),
    Company.find({}).select('companyName status createdAt submittedBy').populate('submittedBy', 'name').sort({ createdAt: -1 }).limit(4).lean(),
    Placement.find({ earningAmount: { $gt: 0 } }).select('earningAmount earningStatus createdAt updatedAt baId').populate('baId', 'name').sort({ updatedAt: -1 }).limit(4).lean(),
    CrmCandidate.countDocuments({ isActive: true }),
    CrmUser.countDocuments({ role: 'crm_employee', isActive: true }),
    CrmCallLog.countDocuments({ calledAt: { $gte: todayStart, $lte: todayEnd } }),
    CrmCandidate.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$callStatus', count: { $sum: 1 } } }]),
    CrmCallLog.countDocuments({ nextFollowup: { $gte: todayStart, $lte: todayEnd } }),
    CrmCandidate.find({ isActive: true }).select('candidateName createdAt').sort({ createdAt: -1 }).limit(4).lean(),
    Employee.find({ isDeleted: false, status: 'active' }).select('firstName lastName email department dateOfBirth joiningDate').lean(),
    Department.find({ status: 'active' }).select('openPositions').lean(),
    Attendance.find({ date: { $gte: todayStart, $lte: todayEnd } })
      .populate('employee', 'firstName lastName email')
      .sort({ 'checkIn.time': -1, updatedAt: -1 })
      .lean(),
    Attendance.aggregate([
      { $match: { date: { $gte: week[0].date, $lte: endOfDay(week[4].date) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: process.env.EMS_TIMEZONE || 'Asia/Kolkata' } },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'half_day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }
        }
      }
    ]),
    Leave.find({
      status: 'approved',
      startDate: { $lte: todayEnd },
      endDate: { $gte: todayStart }
    }).distinct('employee'),
    Leave.find({ status: { $in: ['pending_manager', 'pending_hr'] } })
      .populate('employee', 'firstName lastName email')
      .sort({ createdAt: 1 })
      .lean(),
    Leave.find({ status: { $in: ['pending_manager', 'pending_hr'] } })
      .populate('employee', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    CmsCandidate.countDocuments({}),
    CmsCandidate.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
    CmsCandidate.find({})
      .select('candidateCode fullName mobileNumber emailId appliedFor currentDesignation interestedDepartment createdAt source intakeType advisor advisorCode referenceName createdBy sourceCandidateId')
      .populate('createdBy', 'name email role advisorCode')
      .populate('advisor', 'name email role advisorCode')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Candidate.find({})
      .select('candidateName mobileNumber emailId appliedFor jobProfile source createdAt submittedBy')
      .populate('submittedBy', 'name email role advisorCode')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Candidate.find({}).select('candidateName emailId mobileNumber jobProfile status createdAt').sort({ createdAt: -1 }).limit(10).lean()
  ])

  const advisorNameMap = new Map(
    advisorProfiles.map((profile) => [String(profile.userId?._id || profile.userId), profile.fullName || profile.userId?.name || 'Advisor'])
  )
  const totalEarnings = placements.reduce((sum, placement) => sum + Number(placement.earningAmount || 0), 0)
  const earningsMap = new Map(months.map((item) => [item.key, 0]))
  const topAdvisorMap = new Map()

  placements.forEach((placement) => {
    const amount = Number(placement.earningAmount || 0)
    const date = placement.earningPaidDate || placement.updatedAt || placement.createdAt
    const key = monthKey(new Date(date))
    if (new Date(date) >= monthStart && earningsMap.has(key)) {
      earningsMap.set(key, earningsMap.get(key) + amount)
    }

    const advisorId = String(placement.baId?._id || placement.baId || 'unknown')
    const current = topAdvisorMap.get(advisorId) || { name: advisorNameMap.get(advisorId) || placement.baId?.name || 'Advisor', earnings: 0 }
    current.earnings += amount
    topAdvisorMap.set(advisorId, current)
  })

  const pipelineMap = new Map(crmPipelineRows.map((row) => [row._id || 'pending', row.count]))
  const pipeline = [
    { stage: 'New Lead', count: pipelineMap.get('pending') || 0 },
    { stage: 'Contacted', count: pipelineMap.get('called') || 0 },
    { stage: 'In Progress', count: (pipelineMap.get('followup') || 0) + (pipelineMap.get('busy') || 0) },
    { stage: 'Success', count: pipelineMap.get('converted') || 0 },
    { stage: 'Not Interested', count: pipelineMap.get('rejected') || 0 }
  ]

  const leaveEmployeeIds = new Set(approvedLeavesToday.map(String))
  let presentToday = 0
  let lateToday = 0
  let explicitAbsent = 0

  todayAttendance.forEach((record) => {
    if (record.status === 'late') {
      presentToday += 1
      lateToday += 1
    } else if (['present', 'half_day'].includes(record.status)) {
      presentToday += 1
    } else if (record.status === 'absent') {
      explicitAbsent += 1
    } else if (['leave', 'on_leave'].includes(record.status)) {
      leaveEmployeeIds.add(String(record.employee?._id || record.employee))
    }
  })

  const onLeave = leaveEmployeeIds.size
  const absentToday = Math.max(explicitAbsent, activeEmployees.length - presentToday - onLeave)
  const weeklyMap = new Map(weeklyRows.map((row) => [row._id, row]))
  const weeklyAttendance = week.map(({ day, date }) => {
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const row = weeklyMap.get(key) || {}
    return { day, present: row.present || 0, absent: row.absent || 0, late: row.late || 0 }
  })

  const payrollPending = await payrollPendingDepartments({ month: currentMonth, year: currentYear, activeEmployees })
  const openPositions = departments.reduce((sum, department) => sum + Number(department.openPositions || 0), 0)
  const birthdays = activeEmployees
    .filter((employee) => {
      if (!employee.dateOfBirth) return false
      const date = new Date(employee.dateOfBirth)
      return date.getDate() === today.getDate() && date.getMonth() === today.getMonth()
    })
    .map(fullName)
  const anniversaries = activeEmployees
    .filter((employee) => {
      if (!employee.joiningDate) return false
      const date = new Date(employee.joiningDate)
      return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && today.getFullYear() > date.getFullYear()
    })
    .map((employee) => {
      const date = new Date(employee.joiningDate)
      const years = today.getFullYear() - date.getFullYear()
      return `${fullName(employee)} - ${years} year${years === 1 ? '' : 's'}`
    })

  const pendingActions = [
    { type: 'leave_approval', count: pendingLeaves.length, route: '/ems/leaves/pending' },
    { type: 'advisor_candidates', count: advisorCandidatesNew, route: '/admin/students?status=not_viewed' },
    { type: 'crm_followups', count: crmFollowupsDue, route: '/admin/crm/candidates' },
    { type: 'payroll_pending', count: payrollPending, route: '/ems/payroll' }
  ]
  const recentCandidateLogs = buildRecentCandidateLogs(recentCmsCandidates, recentSourceCandidates)

  const recentActivity = [
    ...todayAttendance
      .filter((record) => record.checkIn?.time)
      .map((record) => ({
        module: 'employee',
        text: `${fullName(record.employee)} checked in at ${formatTime(record.checkIn.time)}`,
        time: relativeTime(record.checkIn.time),
        timestamp: new Date(record.checkIn.time)
      })),
    ...recentCrmCandidates.map((candidate) => ({
      module: 'crm',
      text: `New candidate ${candidate.candidateName} added`,
      time: relativeTime(candidate.createdAt),
      timestamp: new Date(candidate.createdAt)
    })),
    ...recentCompanies.map((company) => ({
      module: 'advisor',
      text: `New advisor company "${company.companyName}" registered`,
      time: relativeTime(company.createdAt),
      timestamp: new Date(company.createdAt)
    })),
    ...recentCandidates.map((candidate) => ({
      module: 'advisor',
      text: `New advisor candidate ${candidate.candidateName} submitted`,
      time: relativeTime(candidate.createdAt),
      timestamp: new Date(candidate.createdAt)
    })),
    ...recentLeaves.map((leave) => ({
      module: 'employee',
      text: `Leave request from ${fullName(leave.employee)} is pending`,
      time: relativeTime(leave.createdAt),
      timestamp: new Date(leave.createdAt)
    })),
    ...recentPlacements.map((placement) => ({
      module: 'advisor',
      text: `Earnings updated: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(placement.earningAmount || 0))} received`,
      time: relativeTime(placement.updatedAt || placement.createdAt),
      timestamp: new Date(placement.updatedAt || placement.createdAt)
    }))
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8)
    .map(({ timestamp, ...item }) => item)

  res.json({
    advisorStats: {
      totalAdvisors,
      activeCompanies,
      totalEarnings,
      earningsLastSixMonths: months.map((item) => ({ month: item.month, amount: earningsMap.get(item.key) || 0 })),
      topAdvisors: Array.from(topAdvisorMap.values()).sort((a, b) => b.earnings - a.earnings).slice(0, 5)
    },
    crmStats: {
      totalCandidates: totalCrmCandidates,
      successEmployees,
      callsToday,
      pipeline
    },
    employeeStats: {
      totalEmployees: activeEmployees.length,
      presentToday,
      absentToday,
      onLeave,
      openPositions,
      pendingLeaves: pendingLeaves.length,
      weeklyAttendance,
      todayCheckins: todayAttendance
        .filter((record) => record.checkIn?.time)
        .slice(0, 3)
        .map((record) => ({ name: fullName(record.employee), time: formatTime(record.checkIn.time), status: record.status })),
      birthdays,
      anniversaries
    },
    candidateManagementStats: {
      totalCandidates: totalCmsCandidates,
      todayCandidates: todayCmsCandidates,
      latestCandidates: latest10Candidates,
      recentCandidateLogs
    },
    pendingActions,
    recentActivity
  })
}

module.exports = {
  dashboardSummary
}
