const Employee = require('../models/Employee')
const Leave = require('../models/Leave')
const LeaveBalance = require('../models/LeaveBalance')
const { DEFAULT_LEAVE_ALLOCATIONS, LEAVE_TYPES } = require('../config/emsConstants')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { dateRangeFilter, isObjectId, pagination, safeText } = require('../utils/emsHelpers')
const { normalizeLeavePayload } = require('../validations/leaveValidation')

const employeeByIdentifier = async (identifier) => {
  if (!identifier) return null
  const query = isObjectId(identifier)
    ? { _id: identifier, isDeleted: false }
    : { employeeId: String(identifier).trim().toUpperCase(), isDeleted: false }
  return Employee.findOne(query)
}

const getOrCreateBalance = async (employeeId, year = new Date().getFullYear()) => {
  let balance = await LeaveBalance.findOne({ employee: employeeId, year })
  if (!balance) {
    balance = await LeaveBalance.create({ employee: employeeId, year })
  }
  return balance
}

const serializeBalance = (balance) => {
  const balances = {}
  LEAVE_TYPES.forEach((type) => {
    const current = balance.balances.get(type) || {
      allocated: DEFAULT_LEAVE_ALLOCATIONS[type] || 0,
      used: 0,
      pending: 0
    }
    balances[type] = {
      allocated: current.allocated || 0,
      used: current.used || 0,
      pending: current.pending || 0,
      available: Math.max(0, (current.allocated || 0) - (current.used || 0) - (current.pending || 0))
    }
  })
  return { employee: balance.employee, year: balance.year, balances }
}

const adjustBalance = async ({ employee, year, leaveType, amount, field }) => {
  const balance = await getOrCreateBalance(employee, year)
  const current = balance.balances.get(leaveType) || {
    allocated: DEFAULT_LEAVE_ALLOCATIONS[leaveType] || 0,
    used: 0,
    pending: 0
  }
  current[field] = Math.max(0, Number(current[field] || 0) + amount)
  balance.balances.set(leaveType, current)
  await balance.save()
  return balance
}

const applyLeave = async (req, res) => {
  const fallbackEmployeeId = req.emsUser?.source === 'ems_employee' ? req.emsUser.id : null
  const { payload, errors } = normalizeLeavePayload(req.body, fallbackEmployeeId)
  if (errors.length) {
    return res.status(400).json({ message: errors.join(', ') })
  }

  const employee = await employeeByIdentifier(payload.employee)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id) && req.emsUser?.role !== 'manager') {
    return res.status(403).json({ message: 'You cannot apply leave for this employee' })
  }

  const leave = await Leave.create({
    ...payload,
    employee: employee._id,
    status: employee.manager ? 'pending_manager' : 'pending_hr',
    appliedBy: req.emsUser?.id || null
  })

  await adjustBalance({
    employee: employee._id,
    year: new Date(payload.startDate).getFullYear(),
    leaveType: payload.leaveType,
    amount: payload.totalDays,
    field: 'pending'
  })

  const populated = await Leave.findById(leave._id).populate('employee', 'employeeId firstName lastName email department')
  res.status(201).json({ message: 'Leave applied', leave: populated })
}

const listLeaves = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = {
    ...dateRangeFilter(req.query, 'startDate')
  }
  if (req.query.status) filter.status = req.query.status
  if (req.query.type) filter.leaveType = req.query.type
  if (req.query.employeeId) {
    const employee = await employeeByIdentifier(req.query.employeeId)
    if (employee) filter.employee = employee._id
  }
  if (req.emsUser?.role === 'employee') {
    filter.employee = req.emsUser.id
  }

  const [items, total] = await Promise.all([
    Leave.find(filter)
      .populate({ path: 'employee', select: 'employeeId firstName lastName email department', populate: { path: 'department', select: 'name code' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const pendingLeaves = async (req, res) => {
  req.query.status = req.query.status || ['pending_manager', 'pending_hr']
  const filter = { status: { $in: Array.isArray(req.query.status) ? req.query.status : ['pending_manager', 'pending_hr'] } }
  const items = await Leave.find(filter)
    .populate({ path: 'employee', select: 'employeeId firstName lastName email department manager', populate: { path: 'department', select: 'name code' } })
    .sort({ createdAt: 1 })
    .lean()
  res.json({ items })
}

const approveLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate('employee', 'employeeId firstName lastName email manager')
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found' })
  }

  const role = req.emsUser?.role
  const now = new Date()
  const note = safeText(req.body?.note)

  if (leave.status === 'pending_manager' && role === 'manager') {
    leave.managerApproval = { approver: req.emsUser.id, status: 'approved', actedAt: now, note }
    leave.status = 'pending_hr'
  } else {
    leave.hrApproval = { approver: req.emsUser?.id || null, status: 'approved', actedAt: now, note }
    if (leave.status === 'pending_manager') {
      leave.managerApproval = { approver: req.emsUser?.id || null, status: 'approved', actedAt: now, note: 'Approved by HR/Admin' }
    }
    leave.status = 'approved'
    await adjustBalance({
      employee: leave.employee._id,
      year: new Date(leave.startDate).getFullYear(),
      leaveType: leave.leaveType,
      amount: -leave.totalDays,
      field: 'pending'
    })
    await adjustBalance({
      employee: leave.employee._id,
      year: new Date(leave.startDate).getFullYear(),
      leaveType: leave.leaveType,
      amount: leave.totalDays,
      field: 'used'
    })
  }

  await leave.save()
  res.json({ message: 'Leave approved', leave })
}

const rejectLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id)
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found' })
  }

  const previousStatus = leave.status
  const reason = safeText(req.body?.reason)
  leave.status = 'rejected'
  leave.rejectionReason = reason
  const action = { approver: req.emsUser?.id || null, status: 'rejected', actedAt: new Date(), note: reason }
  if (previousStatus === 'pending_manager') leave.managerApproval = action
  else leave.hrApproval = action

  await adjustBalance({
    employee: leave.employee,
    year: new Date(leave.startDate).getFullYear(),
    leaveType: leave.leaveType,
    amount: -leave.totalDays,
    field: 'pending'
  })

  await leave.save()
  res.json({ message: 'Leave rejected', leave })
}

const leaveBalance = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.employeeId)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id)) {
    return res.status(403).json({ message: 'You cannot access this leave balance' })
  }

  const balance = await getOrCreateBalance(employee._id, Number(req.query.year) || new Date().getFullYear())
  res.json({ employee, balance: serializeBalance(balance) })
}

module.exports = {
  applyLeave,
  approveLeave,
  leaveBalance,
  listLeaves,
  pendingLeaves,
  rejectLeave
}
