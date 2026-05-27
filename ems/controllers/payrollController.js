const Employee = require('../models/Employee')
const Payroll = require('../models/Payroll')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { generatePayslipPdf } = require('../utils/emsPdfGenerator')
const { isObjectId, money, pagination } = require('../utils/emsHelpers')

const employeeByIdentifier = async (identifier) => {
  if (!identifier) return null
  const query = isObjectId(identifier)
    ? { _id: identifier, isDeleted: false }
    : { employeeId: String(identifier).trim().toUpperCase(), isDeleted: false }
  return Employee.findOne(query)
}

const calculatePayroll = (employee, overrides = {}) => {
  const salary = {
    basic: money(overrides.basic ?? employee.salary?.basic),
    hra: money(overrides.hra ?? employee.salary?.hra),
    da: money(overrides.da ?? employee.salary?.da),
    allowances: money(overrides.allowances ?? employee.salary?.allowances),
    pf: money(overrides.pf ?? employee.salary?.pf),
    tds: money(overrides.tds ?? employee.salary?.tds)
  }
  const grossPay = money(salary.basic + salary.hra + salary.da + salary.allowances)
  const totalDeductions = money(salary.pf + salary.tds)
  const netPay = money(grossPay - totalDeductions)
  return { salary, grossPay, totalDeductions, netPay }
}

const generatePayroll = async (req, res) => {
  const month = Number(req.body?.month)
  const year = Number(req.body?.year)
  if (!month || month < 1 || month > 12 || !year) {
    return res.status(400).json({ message: 'Valid month and year are required' })
  }

  const employeeIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []
  const filter = { isDeleted: false, status: 'active' }
  if (employeeIds.length) {
    const employees = await Promise.all(employeeIds.map((id) => employeeByIdentifier(id)))
    filter._id = { $in: employees.filter(Boolean).map((employee) => employee._id) }
  }

  const employees = await Employee.find(filter)
  const results = []

  for (const employee of employees) {
    const calculated = calculatePayroll(employee, req.body?.overrides?.[String(employee._id)] || {})
    const payroll = await Payroll.findOneAndUpdate(
      { employee: employee._id, month, year },
      {
        employee: employee._id,
        month,
        year,
        ...calculated,
        generatedBy: req.emsUser?.id || null
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    )
    results.push(payroll)
  }

  res.status(201).json({ message: 'Payroll generated', count: results.length, items: results })
}

const listPayroll = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = {}
  if (req.query.month) filter.month = Number(req.query.month)
  if (req.query.year) filter.year = Number(req.query.year)
  if (req.query.status) filter.status = req.query.status

  const [items, total] = await Promise.all([
    Payroll.find(filter)
      .populate({ path: 'employee', select: 'employeeId firstName lastName email department', populate: { path: 'department', select: 'name code' } })
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payroll.countDocuments(filter)
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const employeePayroll = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.id)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id)) {
    return res.status(403).json({ message: 'You cannot access this payroll record' })
  }

  const items = await Payroll.find({ employee: employee._id }).sort({ year: -1, month: -1 }).lean()
  res.json({ employee, items })
}

const releasePayroll = async (req, res) => {
  const payroll = await Payroll.findByIdAndUpdate(
    req.params.id,
    {
      status: 'Released',
      releasedAt: new Date(),
      releasedBy: req.emsUser?.id || null
    },
    { returnDocument: 'after', runValidators: true }
  ).populate('employee', 'employeeId firstName lastName email')

  if (!payroll) {
    return res.status(404).json({ message: 'Payroll not found' })
  }

  res.json({ message: 'Payroll released', payroll })
}

const payslip = async (req, res) => {
  const payroll = await Payroll.findById(req.params.id).populate('employee')
  if (!payroll) {
    return res.status(404).json({ message: 'Payroll not found' })
  }

  if (!canAccessEmployee(req, payroll.employee?._id)) {
    return res.status(403).json({ message: 'You cannot access this payslip' })
  }

  const pdf = generatePayslipPdf({ payroll, employee: payroll.employee })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="payslip-${payroll.employee?.employeeId || payroll._id}.pdf"`)
  res.send(pdf)
}

module.exports = {
  employeePayroll,
  generatePayroll,
  listPayroll,
  payslip,
  releasePayroll
}
