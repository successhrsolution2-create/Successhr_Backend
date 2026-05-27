const Department = require('../models/Department')
const Employee = require('../models/Employee')
const { buildSearch, pagination, pick, safeText } = require('../utils/emsHelpers')

const departmentFields = ['name', 'code', 'description', 'manager', 'openPositions', 'status']

const listDepartments = async (req, res) => {
  const { page, limit, skip } = pagination(req.query)
  const filter = {
    ...buildSearch(req.query.search, ['name', 'code'])
  }

  if (req.query.status) filter.status = req.query.status

  const [items, total] = await Promise.all([
    Department.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .populate('manager', 'employeeId firstName lastName email')
      .lean(),
    Department.countDocuments(filter)
  ])

  const ids = items.map((item) => item._id)
  const headcounts = await Employee.aggregate([
    { $match: { isDeleted: false, status: 'active', department: { $in: ids } } },
    { $group: { _id: '$department', total: { $sum: 1 } } }
  ])
  const headcountMap = new Map(headcounts.map((item) => [String(item._id), item.total]))

  res.json({
    items: items.map((item) => ({ ...item, headcount: headcountMap.get(String(item._id)) || 0 })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  })
}

const createDepartment = async (req, res) => {
  const payload = pick(req.body, departmentFields)
  payload.name = safeText(payload.name)
  payload.code = safeText(payload.code).toUpperCase()
  payload.createdBy = req.emsUser?.id || null

  if (!payload.name || !payload.code) {
    return res.status(400).json({ message: 'Department name and code are required' })
  }

  const department = await Department.create(payload)
  res.status(201).json({ message: 'Department created', department })
}

const updateDepartment = async (req, res) => {
  const payload = pick(req.body, departmentFields)
  if (payload.name !== undefined) payload.name = safeText(payload.name)
  if (payload.code !== undefined) payload.code = safeText(payload.code).toUpperCase()
  payload.updatedBy = req.emsUser?.id || null

  const department = await Department.findByIdAndUpdate(req.params.id, payload, {
    returnDocument: 'after',
    runValidators: true
  }).populate('manager', 'employeeId firstName lastName email')

  if (!department) {
    return res.status(404).json({ message: 'Department not found' })
  }

  res.json({ message: 'Department updated', department })
}

const deleteDepartment = async (req, res) => {
  const activeEmployees = await Employee.countDocuments({ department: req.params.id, isDeleted: false, status: 'active' })
  if (activeEmployees > 0) {
    return res.status(409).json({ message: 'Cannot delete a department with active employees' })
  }

  const department = await Department.findByIdAndDelete(req.params.id)
  if (!department) {
    return res.status(404).json({ message: 'Department not found' })
  }

  res.json({ message: 'Department deleted' })
}

module.exports = {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment
}
