const Student = require('../models/Student')
const { emitToAdmin } = require('../socket')

const documentUrl = (file) => `/uploads/${file.filename}`
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const normalizeStudentIdentity = (payload) => {
  const normalizedMobile = toDigits(payload.mobileNumber)
  if (!normalizedMobile) {
    const error = new Error('Mobile number is required')
    error.statusCode = 400
    throw error
  }
  if (normalizedMobile.length !== 10) {
    const error = new Error('Mobile number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedWhatsapp = toDigits(payload.whatsappNo)
  if (payload.whatsappNo && normalizedWhatsapp.length !== 10) {
    const error = new Error('WhatsApp number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedAadhaar = toDigits(payload.aadhaarNo)
  if (payload.aadhaarNo && normalizedAadhaar.length !== 12) {
    const error = new Error('Aadhaar number must be 12 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedEmail = normalizeEmail(payload.emailId)
  if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  payload.mobileNumber = normalizedMobile
  payload.whatsappNo = normalizedWhatsapp || undefined
  payload.aadhaarNo = normalizedAadhaar || undefined
  payload.emailId = normalizedEmail || undefined
}

const ensureUniqueStudentIdentity = async (payload, excludeId) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await Student.findOne(query).select('_id')
    if (existing) {
      const error = new Error(`A student with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const populateStudent = (query) => query.populate('submittedBy', 'name email')

const canAccess = (req, student) => {
  const ownerId = student.submittedBy?._id || student.submittedBy
  return req.user.role === 'superAdmin' || ownerId.toString() === req.user._id.toString()
}

const getStudents = async (req, res) => {
  const query = req.user.role === 'superAdmin' ? {} : { submittedBy: req.user._id }
  const students = await Student.find(query)
    .populate('submittedBy', 'name email')
    .sort({ status: 1, priorityOrder: 1, createdAt: -1 })

  res.json(students)
}

const createStudent = async (req, res) => {
  normalizeStudentIdentity(req.body)
  await ensureUniqueStudentIdentity(req.body)

  await Student.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  let student = await Student.create({
    ...req.body,
    submittedBy: req.user._id,
    status: 'not_viewed',
    priorityOrder: 0
  })

  student = await Student.findById(student._id).populate('submittedBy', 'name email')
  emitToAdmin('new_student', student)

  res.status(201).json(student)
}

const getStudentById = async (req, res) => {
  const student = await populateStudent(Student.findById(req.params.id))

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  if (!canAccess(req, student)) {
    return res.status(403).json({ message: 'You can only access your own references' })
  }

  res.json(student)
}

const updateStudent = async (req, res) => {
  const student = await Student.findById(req.params.id)

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  if (!canAccess(req, student)) {
    return res.status(403).json({ message: 'You can only update your own references' })
  }

  const blocked = ['submittedBy', '_id']
  if (req.user.role === 'businessAdvisor') {
    blocked.push('priorityOrder', 'status', 'adminNotes', 'selectionStatus')
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (!blocked.includes(key)) {
      student[key] = value
    }
  })

  normalizeStudentIdentity(student)
  await ensureUniqueStudentIdentity(student, student._id)

  await student.save()
  res.json(await Student.findById(student._id).populate('submittedBy', 'name email'))
}

const deleteStudent = async (req, res) => {
  const student = await Student.findById(req.params.id)

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  await student.deleteOne()
  res.json({ message: 'Student reference deleted' })
}

const uploadStudentDocuments = async (req, res) => {
  const student = await Student.findById(req.params.id)

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  if (!canAccess(req, student)) {
    return res.status(403).json({ message: 'You can only upload documents for your own references' })
  }

  const files = req.files?.length ? req.files : req.file ? [req.file] : []

  if (files.length === 0) {
    return res.status(400).json({ message: 'At least one file is required' })
  }

  files.forEach((file) => {
    student.documents.push({
      fileName: file.originalname,
      fileUrl: documentUrl(file),
      uploadedAt: new Date()
    })
  })

  await student.save()
  res.json(await Student.findById(student._id).populate('submittedBy', 'name email'))
}

const updateStudentStatus = async (req, res) => {
  const { status, adminNotes } = req.body
  const student = await Student.findById(req.params.id)

  if (!student) {
    return res.status(404).json({ message: 'Student reference not found' })
  }

  const statusChanged = status && status !== student.status

  if (status) {
    if (!Student.statusValues.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    if (statusChanged) {
      await Student.updateMany({ status }, { $inc: { priorityOrder: 1 } })
      student.priorityOrder = 0
    }

    student.status = status
  }

  if (adminNotes !== undefined) {
    student.adminNotes = adminNotes
  }

  await student.save()

  emitToAdmin('status_updated', {
    type: 'student',
    id: student._id.toString(),
    status: student.status
  })

  res.json(await Student.findById(student._id).populate('submittedBy', 'name email'))
}

const reorderStudents = async (req, res) => {
  const { orderedIds } = req.body

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ message: 'orderedIds must be an array' })
  }

  await Student.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { priorityOrder: index } }
      }
    }))
  )

  emitToAdmin('reordered', { type: 'student', orderedIds })
  res.json({ orderedIds })
}

module.exports = {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  uploadStudentDocuments,
  updateStudentStatus,
  reorderStudents
}
