const CmsCandidate = require('../../models/cms/CmsCandidate')
const CmsCompany = require('../../models/cms/CmsCompany')
const CmsInterview = require('../../models/cms/CmsInterview')
const CmsRemark = require('../../models/cms/CmsRemark')
const Candidate = require('../../models/Candidate')
const jwt = require('jsonwebtoken')
const { nextCandidateCode } = require('../../utils/cmsCandidateCode')
const { syncCandidateFromCms } = require('../../utils/candidateStatusSync')
const { uploadToS3, getObjectFromS3 } = require('../../utils/s3Upload')
const { validateUploadFile } = require('../../utils/fileValidation')
const { generateSuccessRemarkPdf, successRemarkPdfFileName } = require('../../utils/successRemarkPdf')
const {
  candidateDocumentAllowedExtensionsByKey,
  candidateDocumentAllowedMimeTypesByKey,
  candidateDocumentLabelByKey,
  isCandidateDocumentKey
} = require('../../utils/candidateDocuments')
const { invalidateCache } = require('../../src/utils/invalidateCache')

const interviewDocumentLabelByKey = {
  appointmentLetter: 'Appointment Letter',
  offerLetter: 'Offer Letter',
  interviewLetter: 'Interview Letter',
  confirmationLetter: 'Confirmation Letter'
}

const isInterviewDocumentKey = (key) =>
  Object.prototype.hasOwnProperty.call(interviewDocumentLabelByKey, key)

const remarkKeys = [
  'documentsSubmitted',
  'offerLetterReceived',
  'appointmentLetterGiven',
  'joiningDateConfirmed',
  'joiningCompleted',
  'pfEnrolled',
  'esicEnrolled',
  'backgroundCheckDone',
  'trainingCompleted',
  'idCardIssued',
  'uniformProvided',
  'salaryAccountOpened',
  'firstSalaryReceived',
  'probationCompleted',
  'permanentEmployment',
  'exitFormalitiesDone',
  'noDuesCertificate',
  'experienceLetterGiven',
  'relievingLetterGiven',
  'feedbackCollected'
]

const successRemarkKeys = [
  'selected',
  'joined',
  'notSelected',
  'rejected',
  'resumeReady',
  'educationVerified',
  'experienceVerified',
  'skillsAssessed',
  'backgroundChecked',
  'referenceVerified',
  'documentsCollected',
  'salaryNegotiated',
  'offerAccepted',
  'joiningConfirmed'
]

const defaultCheckboxes = () =>
  remarkKeys.reduce((acc, key) => {
    acc[key] = { checked: false, updatedAt: null }
    return acc
  }, {})

const ensureRemark = async (candidateId) => {
  let remark = await CmsRemark.findOne({ candidateId })
  if (!remark) {
    remark = await CmsRemark.create({ candidateId, checkboxes: defaultCheckboxes() })
  }
  return remark
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toDigits = (value) => String(value || '').replace(/\D/g, '')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const invalidateReferenceCaches = () => {
  invalidateCache('/api/candidates').catch(() => {})
  invalidateCache('/api/students').catch(() => {})
}

const normalizeCandidateIdentity = (payload) => {
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

const ensureUniqueCandidateIdentity = async (payload) => {
  const checks = [
    { field: 'mobileNumber', label: 'mobile number', value: payload.mobileNumber },
    { field: 'emailId', label: 'email', value: payload.emailId },
    { field: 'aadhaarNo', label: 'aadhaar number', value: payload.aadhaarNo }
  ].filter((item) => item.value)

  for (const check of checks) {
    const [existingCms, existingCandidate] = await Promise.all([
      CmsCandidate.findOne({ [check.field]: check.value }).select('_id'),
      Candidate.findOne({ [check.field]: check.value }).select('_id')
    ])

    if (existingCms || existingCandidate) {
      const error = new Error(`A candidate with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const normalizeCompanyIdentity = (payload) => {
  const normalizedMobile = toDigits(payload.mobileNo)
  if (payload.mobileNo && normalizedMobile.length !== 10) {
    const error = new Error('Mobile number must be 10 digits')
    error.statusCode = 400
    throw error
  }

  const normalizedEmail = normalizeEmail(payload.emailId)
  if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
    const error = new Error('Enter a valid email')
    error.statusCode = 400
    throw error
  }

  payload.mobileNo = normalizedMobile || undefined
  payload.emailId = normalizedEmail || undefined
}

const ensureUniqueCmsCompanyIdentity = async (payload, excludeId) => {
  const checks = [
    { field: 'mobileNo', label: 'mobile number', value: payload.mobileNo },
    { field: 'emailId', label: 'email', value: payload.emailId }
  ].filter((item) => item.value)

  for (const check of checks) {
    const query = { [check.field]: check.value }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existing = await CmsCompany.findOne(query).select('_id')
    if (existing) {
      const error = new Error(`A company with this ${check.label} already exists`)
      error.statusCode = 409
      throw error
    }
  }
}

const createCandidate = async (req, res) => {
  normalizeCandidateIdentity(req.body)
  await ensureUniqueCandidateIdentity(req.body)

  const candidateCode = await nextCandidateCode(new Date())
  const candidate = await CmsCandidate.create({
    ...req.body,
    candidateCode,
    createdBy: req.user._id
  })
  await ensureRemark(candidate._id)
  res.status(201).json(candidate)
}

const withResolvedReference = (candidateDoc) => {
  const candidate = candidateDoc?.toObject ? candidateDoc.toObject() : candidateDoc
  if (!candidate) return candidate

  if (!candidate.referenceName && candidate.intakeType === 'advisor') {
    const advisorName =
      candidate.advisor?.name || candidate.advisor?.email || candidate.advisor?.advisorCode || null
    candidate.referenceName = advisorName
  }

  return candidate
}

const createCompany = async (req, res) => {
  normalizeCompanyIdentity(req.body)
  await ensureUniqueCmsCompanyIdentity(req.body)

  const company = await CmsCompany.create({
    ...req.body,
    createdBy: req.user._id
  })

  res.status(201).json(company)
}

const listCandidates = async (req, res) => {
  const { search = '', gender, marriageStatus } = req.query

  const query = {}
  if (search.trim()) {
    const regex = new RegExp(search.trim(), 'i')
    query.$or = [{ fullName: regex }, { mobileNumber: regex }, { emailId: regex }, { keySkills: regex }]
  }
  if (gender) {
    query.gender = gender
  }
  if (marriageStatus) {
    query.marriageStatus = marriageStatus
  }

  const candidates = await CmsCandidate.find(query)
    .populate('advisor', 'name email advisorCode')
    .sort({ createdAt: -1 })

  const candidateIds = candidates.map((candidate) => candidate._id)
  const interviews = candidateIds.length
    ? await CmsInterview.find({ candidateId: { $in: candidateIds } })
        .select(
          'candidateId candidateName companyName jobRole reference attendInterview interestedForJoin interviewDate selectionChances ratingForCompany notAttendRemark notInterestedReason replyFromCompany positiveFeedback negativeFeedback overallDiscussion note updatedBy remark result createdAt updatedAt'
        )
        .sort({ interviewDate: -1, createdAt: -1 })
    : []
  const interviewsByCandidate = interviews.reduce((acc, interview) => {
    const key = String(interview.candidateId)
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key).push(interview)
    return acc
  }, new Map())

  res.json(
    candidates.map((candidateDoc) => {
      const candidate = withResolvedReference(candidateDoc)
      candidate.interviews = interviewsByCandidate.get(String(candidate._id)) || []
      candidate.interviewCount = candidate.interviews.length
      return candidate
    })
  )
}

const listCompanies = async (req, res) => {
  const { search = '' } = req.query

  const query = {}
  if (search.trim()) {
    const regex = new RegExp(search.trim(), 'i')
    query.$or = [
      { companyName: regex },
      { companyAddress: regex },
      { contactPersonName: regex },
      { contactPersonDesignation: regex },
      { mobileNo: regex },
      { emailId: regex },
      { 'jobRequirements.jobProfile': regex },
      { 'jobRequirements.jobLocation': regex }
    ]
  }

  const companies = await CmsCompany.find(query).sort({ createdAt: -1 })
  res.json(companies)
}

const getCandidateById = async (req, res) => {
  const candidateDoc = await CmsCandidate.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('advisor', 'name email advisorCode')
  const candidate = withResolvedReference(candidateDoc)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const [interviews, remark] = await Promise.all([
    CmsInterview.find({ candidateId: candidate._id }).sort({ interviewDate: -1, createdAt: -1 }),
    ensureRemark(candidate._id)
  ])

  res.json({ candidate, interviews, remark })
}

const getCompanyById = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id).populate('createdBy', 'name email')

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  res.json({ company })
}

const updateCandidate = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (key !== '_id' && key !== 'createdBy') {
      candidate[key] = value
    }
  })

  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json(candidate)
}

const uploadCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Document image is required' })
  }

  const documentType = String(req.body?.documentType || '').trim()
  if (!isCandidateDocumentKey(documentType)) {
    return res.status(400).json({ message: 'Invalid document type' })
  }

  validateUploadFile(req.file, {
    allowedMimeTypes: candidateDocumentAllowedMimeTypesByKey[documentType],
    allowedExtensions: candidateDocumentAllowedExtensionsByKey[documentType],
    typeMessage: 'File type is not allowed for this document',
    extensionMessage: 'File extension is not allowed for this document'
  })
  const fileUrl = await uploadToS3(req.file, 'candidate-documents')
  candidate.documents = candidate.documents || []
  candidate.documents.push({
    documentType,
    documentLabel: candidateDocumentLabelByKey[documentType],
    fileName: req.file.originalname,
    fileUrl,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date()
  })

  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json({ candidate: withResolvedReference(candidate) })
}

const deleteCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const nextDocuments = (candidate.documents || []).filter((doc) => String(doc?._id) !== String(req.params.docId))
  if (nextDocuments.length === (candidate.documents || []).length) {
    return res.status(404).json({ message: 'Document not found' })
  }

  candidate.documents = nextDocuments
  await candidate.save()
  await syncCandidateFromCms(candidate)
  invalidateReferenceCaches()
  res.json({ candidate: withResolvedReference(candidate) })
}

const viewCandidateDocument = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('documents')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const doc = (candidate.documents || []).find((item) => String(item?._id) === String(req.params.docId))
  if (!doc) {
    return res.status(404).json({ message: 'Document not found' })
  }

  const object = await getObjectFromS3(doc.fileUrl)
  const contentType = doc.mimeType || object?.ContentType || 'application/octet-stream'
  const contentLength = doc.size || object?.ContentLength
  const fileName = doc.fileName || 'document'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`)
  if (contentLength) {
    res.setHeader('Content-Length', String(contentLength))
  }

  const body = object?.Body
  if (!body) {
    return res.status(404).json({ message: 'Document stream not found' })
  }

  if (typeof body.pipe === 'function') {
    body.on('error', (error) => {
      res.destroy(error)
    })
    body.pipe(res)
    return
  }

  const chunks = []
  // Fallback for async iterable body.
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  res.end(Buffer.concat(chunks))
}

const sendSuccessRemarkPdf = (res, candidate, disposition = 'attachment') => {
  const buffer = generateSuccessRemarkPdf(candidate)
  const fileName = successRemarkPdfFileName(candidate).replace(/"/g, '')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Length', String(buffer.length))
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`)
  res.end(buffer)
}

const downloadSuccessRemarkPdf = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  sendSuccessRemarkPdf(res, candidate, 'attachment')
}

const createSuccessRemarkShareLink = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('_id')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const token = jwt.sign(
    {
      purpose: 'success-remark-pdf',
      candidateId: String(candidate._id)
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
  const baseUrl = `${req.protocol}://${req.get('host')}`

  res.json({
    url: `${baseUrl}/api/public/candidates/success-remark/${token}.pdf`,
    expiresInDays: 30
  })
}

const uploadInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Document file is required' })
  }

  const documentType = String(req.body?.documentType || '').trim()
  if (!isInterviewDocumentKey(documentType)) {
    return res.status(400).json({ message: 'Invalid interview document type' })
  }

  validateUploadFile(req.file)
  const fileUrl = await uploadToS3(req.file, 'interview-documents')
  interview.documents = interview.documents || []
  interview.documents.push({
    documentType,
    documentLabel: interviewDocumentLabelByKey[documentType],
    fileName: req.file.originalname,
    fileUrl,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date()
  })

  await interview.save()
  res.json({ interview })
}

const deleteInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const nextDocuments = (interview.documents || []).filter((doc) => String(doc?._id) !== String(req.params.docId))
  if (nextDocuments.length === (interview.documents || []).length) {
    return res.status(404).json({ message: 'Document not found' })
  }

  interview.documents = nextDocuments
  await interview.save()
  res.json({ interview })
}

const viewInterviewDocument = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId).select('documents')
  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const doc = (interview.documents || []).find((item) => String(item?._id) === String(req.params.docId))
  if (!doc) {
    return res.status(404).json({ message: 'Document not found' })
  }

  const object = await getObjectFromS3(doc.fileUrl)
  const contentType = doc.mimeType || object?.ContentType || 'application/octet-stream'
  const contentLength = doc.size || object?.ContentLength
  const fileName = doc.fileName || 'document'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`)
  if (contentLength) {
    res.setHeader('Content-Length', String(contentLength))
  }

  const body = object?.Body
  if (!body) {
    return res.status(404).json({ message: 'Document stream not found' })
  }

  if (typeof body.pipe === 'function') {
    body.on('error', (error) => {
      res.destroy(error)
    })
    body.pipe(res)
    return
  }

  const chunks = []
  // Fallback for async iterable body.
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  res.end(Buffer.concat(chunks))
}

const updateCompany = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (key !== '_id' && key !== 'createdBy') {
      company[key] = value
    }
  })

  normalizeCompanyIdentity(company)
  await ensureUniqueCmsCompanyIdentity(company, company._id)

  await company.save()
  res.json(company)
}

const deleteCandidate = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  await Promise.all([
    CmsInterview.deleteMany({ candidateId: candidate._id }),
    CmsRemark.deleteOne({ candidateId: candidate._id }),
    candidate.deleteOne()
  ])

  res.json({ message: 'Candidate deleted' })
}

const deleteCompany = async (req, res) => {
  const company = await CmsCompany.findById(req.params.id)

  if (!company) {
    return res.status(404).json({ message: 'Company not found' })
  }

  await company.deleteOne()
  res.json({ message: 'Company deleted' })
}

const normalizeRatingForCompany = (value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.min(5, numeric))
}

const interviewPayloadFromBody = (body = {}, candidate = null) => ({
  candidateName: String(body.candidateName || candidate?.fullName || '').trim(),
  companyName: String(body.companyName || '').trim(),
  jobRole: String(body.jobRole || '').trim(),
  reference: String(body.reference || '').trim(),
  attendInterview: String(body.attendInterview || '').trim(),
  interestedForJoin: String(body.interestedForJoin || '').trim(),
  interviewDate: body.interviewDate || null,
  selectionChances: String(body.selectionChances || '').trim(),
  ratingForCompany: normalizeRatingForCompany(body.ratingForCompany),
  notAttendRemark: String(body.notAttendRemark || '').trim(),
  notInterestedReason: String(body.notInterestedReason || '').trim(),
  replyFromCompany: String(body.replyFromCompany || '').trim(),
  positiveFeedback: String(body.positiveFeedback || '').trim(),
  negativeFeedback: String(body.negativeFeedback || '').trim(),
  overallDiscussion: String(body.overallDiscussion || '').trim(),
  note: String(body.note || '').trim(),
  updatedBy: String(body.updatedBy || 'SJP HR').trim(),
  remark: String(body.remark || body.overallDiscussion || '').trim(),
  result: body.result || 'Pending'
})

const addInterview = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const interview = await CmsInterview.create({
    candidateId: req.params.id,
    ...interviewPayloadFromBody(req.body, candidate)
  })

  res.status(201).json(interview)
}

const listInterviews = async (req, res) => {
  const interviews = await CmsInterview.find({ candidateId: req.params.id }).sort({ interviewDate: -1, createdAt: -1 })
  res.json(interviews)
}

const updateInterview = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)

  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  const patch = interviewPayloadFromBody(req.body)
  Object.entries(patch).forEach(([key, value]) => {
    interview[key] = value
  })

  await interview.save()
  res.json(interview)
}

const deleteInterview = async (req, res) => {
  const interview = await CmsInterview.findById(req.params.interviewId)

  if (!interview) {
    return res.status(404).json({ message: 'Interview not found' })
  }

  await interview.deleteOne()
  res.json({ message: 'Interview deleted' })
}

const getRemarks = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).select('_id')
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const remark = await ensureRemark(candidate._id)
  res.json(remark)
}

const updateRemarks = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const remark = await ensureRemark(candidate._id)
  const updates = req.body || {}
  const touched = {
    processRemarks: false,
    successRemarks: false
  }

  const applyUpdate = (key, checked) => {
    if (!successRemarkKeys.includes(key) && !remarkKeys.includes(key)) {
      return false
    }

    if (successRemarkKeys.includes(key)) {
      candidate.successRemarks = candidate.successRemarks || {}
      candidate.successRemarks[key] = { checked, updatedAt: new Date() }
      touched.successRemarks = true
    } else if (remarkKeys.includes(key)) {
      remark.checkboxes[key] = { checked, updatedAt: new Date() }
      touched.processRemarks = true
    }

    return true
  }

  if (typeof updates.checkboxKey === 'string') {
    if (typeof updates.checked !== 'boolean') {
      return res.status(400).json({ message: 'Invalid checkbox update payload' })
    }

    const ok = applyUpdate(updates.checkboxKey, updates.checked)
    if (!ok) {
      return res.status(400).json({ message: 'Invalid checkbox key' })
    }
  } else {
    const keys = Object.keys(updates).filter((key) => typeof updates[key] === 'boolean')
    if (!keys.length) {
      return res.status(400).json({ message: 'No valid checkbox keys provided' })
    }

    let applied = false
    keys.forEach((key) => {
      applied = applyUpdate(key, updates[key]) || applied
    })

    if (!applied) {
      return res.status(400).json({ message: 'No valid checkbox keys provided' })
    }
  }

  await Promise.all([touched.processRemarks ? remark.save() : Promise.resolve(), touched.successRemarks ? candidate.save() : Promise.resolve()])
  if (touched.successRemarks) {
    await syncCandidateFromCms(candidate)
    invalidateReferenceCaches()
  }

  res.json({
    remark,
    successRemarks: candidate.successRemarks || {}
  })
}

module.exports = {
  createCandidate,
  createCompany,
  listCandidates,
  listCompanies,
  getCandidateById,
  getCompanyById,
  updateCandidate,
  uploadCandidateDocument,
  deleteCandidateDocument,
  viewCandidateDocument,
  downloadSuccessRemarkPdf,
  createSuccessRemarkShareLink,
  uploadInterviewDocument,
  deleteInterviewDocument,
  viewInterviewDocument,
  updateCompany,
  deleteCandidate,
  deleteCompany,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
}
