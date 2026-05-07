const CmsCandidate = require('../../models/cms/CmsCandidate')
const CmsInterview = require('../../models/cms/CmsInterview')
const CmsRemark = require('../../models/cms/CmsRemark')

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

const createCandidate = async (req, res) => {
  const candidate = await CmsCandidate.create({
    ...req.body,
    createdBy: req.user._id
  })
  await ensureRemark(candidate._id)
  res.status(201).json(candidate)
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

  const candidates = await CmsCandidate.find(query).sort({ createdAt: -1 })
  res.json(candidates)
}

const getCandidateById = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id).populate('createdBy', 'name email')

  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const [interviews, remark] = await Promise.all([
    CmsInterview.find({ candidateId: candidate._id }).sort({ interviewDate: -1, createdAt: -1 }),
    ensureRemark(candidate._id)
  ])

  res.json({ candidate, interviews, remark })
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
  res.json(candidate)
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

const addInterview = async (req, res) => {
  const candidate = await CmsCandidate.findById(req.params.id)
  if (!candidate) {
    return res.status(404).json({ message: 'Candidate not found' })
  }

  const interview = await CmsInterview.create({
    candidateId: req.params.id,
    companyName: req.body.companyName,
    reference: req.body.reference,
    interviewDate: req.body.interviewDate,
    remark: req.body.remark,
    result: req.body.result
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

  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (key !== '_id' && key !== 'candidateId') {
      interview[key] = value
    }
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

  res.json({
    remark,
    successRemarks: candidate.successRemarks || {}
  })
}

module.exports = {
  createCandidate,
  listCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
}
