const Candidate = require('../models/Candidate')
const User = require('../models/User')
const { uploadToS3 } = require('../utils/s3Upload')
const { validateUploadFile } = require('../utils/fileValidation')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const getAdvisorByCode = async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase()
  const advisor = await User.findOne({
    role: 'businessAdvisor',
    advisorCode: code,
    isActive: true
  }).select('_id name advisorCode')

  if (!advisor) {
    return res.status(404).json({ message: 'Invalid advisor code' })
  }

  res.json({
    advisorId: advisor._id,
    advisorName: advisor.name,
    advisorCode: advisor.advisorCode
  })
}

const submitApplication = async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase()
  const advisor = await User.findOne({
    role: 'businessAdvisor',
    advisorCode: code,
    isActive: true
  }).select('_id name advisorCode')

  if (!advisor) {
    return res.status(404).json({ message: 'Invalid advisor code' })
  }

  const payload = { ...req.body }
  payload.mobileNumber = toDigits(payload.mobileNumber)
  payload.whatsappNo = toDigits(payload.whatsappNo) || undefined
  payload.aadhaarNo = toDigits(payload.aadhaarNo) || undefined
  payload.emailId = normalizeEmail(payload.emailId) || undefined
  payload.totalExperience = payload.totalExperience === '' ? undefined : payload.totalExperience
  payload.noticePeriod = payload.noticePeriod === '' ? undefined : payload.noticePeriod

  if (!payload.candidateName || !payload.mobileNumber) {
    return res.status(400).json({ message: 'Candidate name and mobile number are required' })
  }
  if (payload.mobileNumber.length !== 10) {
    return res.status(400).json({ message: 'Mobile number must be 10 digits' })
  }
  if (payload.whatsappNo && payload.whatsappNo.length !== 10) {
    return res.status(400).json({ message: 'WhatsApp number must be 10 digits' })
  }
  if (payload.aadhaarNo && payload.aadhaarNo.length !== 12) {
    return res.status(400).json({ message: 'Aadhaar number must be 12 digits' })
  }
  if (payload.emailId && !emailRegex.test(payload.emailId)) {
    return res.status(400).json({ message: 'Enter a valid email' })
  }

  const files = req.files || []
  const documents = []
  for (const file of files) {
    validateUploadFile(file)
    const fileUrl = await uploadToS3(file, 'candidate-documents')
    documents.push({
      fileName: file.originalname,
      fileUrl,
      uploadedAt: new Date()
    })
  }

  await Candidate.updateMany({ status: 'not_viewed' }, { $inc: { priorityOrder: 1 } })

  const student = await Candidate.create({
    ...payload,
    documents,
    submittedBy: advisor._id,
    source: 'public_form',
    status: 'not_viewed',
    priorityOrder: 0
  })

  const io = req.app.get('io')
  const studentObject = student.toObject()
  if (io) {
    io.to('admin-board').emit('new_student', {
      ...studentObject,
      submittedBy: { _id: advisor._id, name: advisor.name, advisorCode: advisor.advisorCode },
      source: 'public_form'
    })

    io.to(`ba-${advisor._id}`).emit('new_student_received', {
      studentId: student._id,
      candidateName: student.candidateName,
      source: 'public_form'
    })
  }

  res.status(201).json({
    message: 'Application submitted successfully',
    studentId: student._id
  })
}

module.exports = { getAdvisorByCode, submitApplication }
