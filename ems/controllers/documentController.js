const fs = require('fs/promises')

const Document = require('../models/Document')
const Employee = require('../models/Employee')
const { canAccessEmployee } = require('../middleware/emsRBAC')
const { isObjectId, safeText } = require('../utils/emsHelpers')

const employeeByIdentifier = async (identifier) => {
  if (!identifier) return null
  const query = isObjectId(identifier)
    ? { _id: identifier, isDeleted: false }
    : { employeeId: String(identifier).trim().toUpperCase(), isDeleted: false }
  return Employee.findOne(query)
}

const uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Document file is required' })
  }

  const employee = await employeeByIdentifier(req.body.employeeId || req.body.employee)
  if (!employee) {
    await fs.unlink(req.file.path).catch(() => {})
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id)) {
    await fs.unlink(req.file.path).catch(() => {})
    return res.status(403).json({ message: 'You cannot upload documents for this employee' })
  }

  const document = await Document.create({
    employee: employee._id,
    documentType: req.body.documentType || req.body.type || 'Other',
    title: safeText(req.body.title) || req.file.originalname,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    path: req.file.path,
    url: `/api/ems/documents/file/${req.file.filename}`,
    expiryDate: req.body.expiryDate || null,
    uploadedBy: req.emsUser?.id || null
  })

  res.status(201).json({ message: 'Document uploaded', document })
}

const employeeDocuments = async (req, res) => {
  const employee = await employeeByIdentifier(req.params.id)
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' })
  }

  if (!canAccessEmployee(req, employee._id)) {
    return res.status(403).json({ message: 'You cannot access documents for this employee' })
  }

  const items = await Document.find({ employee: employee._id }).sort({ createdAt: -1 }).lean()
  res.json({ employee, items })
}

const downloadDocument = async (req, res) => {
  const document = await Document.findOne({ fileName: req.params.filename })
  if (!document) {
    return res.status(404).json({ message: 'Document not found' })
  }

  if (!canAccessEmployee(req, document.employee)) {
    return res.status(403).json({ message: 'You cannot access this document' })
  }

  return res.sendFile(document.path)
}

const deleteDocument = async (req, res) => {
  const document = await Document.findByIdAndDelete(req.params.id)
  if (!document) {
    return res.status(404).json({ message: 'Document not found' })
  }

  await fs.unlink(document.path).catch(() => {})
  res.json({ message: 'Document deleted' })
}

module.exports = {
  deleteDocument,
  downloadDocument,
  employeeDocuments,
  uploadDocument
}
