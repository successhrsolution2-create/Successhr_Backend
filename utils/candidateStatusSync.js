const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')

const cmsFromSelection = (selectionStatus) => {
  if (selectionStatus === 'rejected') {
    return { selected: false, joined: false, notSelected: false, rejected: true }
  }
  if (selectionStatus === 'shortlisted') {
    return { selected: false, joined: false, notSelected: true, rejected: false }
  }
  if (selectionStatus === 'joined') {
    return { selected: true, joined: true, notSelected: false, rejected: false }
  }
  if (selectionStatus === 'selected') {
    return { selected: true, joined: false, notSelected: false, rejected: false }
  }
  return { selected: false, joined: false, notSelected: false, rejected: false }
}

const selectionFromCms = (successRemarks = {}) => {
  const joined = Boolean(successRemarks?.joined?.checked)
  const selected = Boolean(successRemarks?.selected?.checked)
  const notSelected = Boolean(successRemarks?.notSelected?.checked)
  const rejected = Boolean(successRemarks?.rejected?.checked)
  if (rejected) return 'rejected'
  if (joined) return 'joined'
  if (selected) return 'selected'
  if (notSelected) return 'shortlisted'
  return undefined
}

const findCmsByCandidate = async (candidate) => {
  if (!candidate?.mobileNumber) return null
  const query = { mobileNumber: candidate.mobileNumber }
  if (candidate?.submittedBy) query.advisor = candidate.submittedBy
  if (candidate?.source) query.source = candidate.source
  return CmsCandidate.findOne(query).sort({ createdAt: -1 })
}

const findCandidateByCms = async (cmsCandidate) => {
  if (!cmsCandidate?.mobileNumber) return null
  const query = { mobileNumber: cmsCandidate.mobileNumber }
  if (cmsCandidate?.advisor) query.submittedBy = cmsCandidate.advisor
  if (cmsCandidate?.source) query.source = cmsCandidate.source
  return Candidate.findOne(query).sort({ createdAt: -1 })
}

const syncCmsFromCandidate = async (candidateOrId) => {
  const candidate =
    typeof candidateOrId === 'string' ? await Candidate.findById(candidateOrId) : candidateOrId
  if (!candidate) return

  const cmsCandidate = await findCmsByCandidate(candidate)
  if (!cmsCandidate) return

  const mapped = cmsFromSelection(candidate.selectionStatus)
  if (candidate.candidateName) cmsCandidate.fullName = candidate.candidateName
  if (candidate.mobileNumber) cmsCandidate.mobileNumber = candidate.mobileNumber
  if (candidate.appliedFor) cmsCandidate.appliedFor = candidate.appliedFor
  if (candidate.education) cmsCandidate.education = candidate.education

  cmsCandidate.successRemarks = cmsCandidate.successRemarks || {}
  cmsCandidate.successRemarks.selected = {
    checked: mapped.selected,
    updatedAt: new Date()
  }
  cmsCandidate.successRemarks.joined = {
    checked: mapped.joined,
    updatedAt: new Date()
  }
  cmsCandidate.successRemarks.notSelected = {
    checked: mapped.notSelected,
    updatedAt: new Date()
  }
  cmsCandidate.successRemarks.rejected = {
    checked: mapped.rejected,
    updatedAt: new Date()
  }
  await cmsCandidate.save()
}

const syncCandidateFromCms = async (cmsCandidateOrId) => {
  const cmsCandidate =
    typeof cmsCandidateOrId === 'string'
      ? await CmsCandidate.findById(cmsCandidateOrId)
      : cmsCandidateOrId
  if (!cmsCandidate) return

  const candidate = await findCandidateByCms(cmsCandidate)
  if (!candidate) return

  if (cmsCandidate.fullName) candidate.candidateName = cmsCandidate.fullName
  if (cmsCandidate.mobileNumber) candidate.mobileNumber = cmsCandidate.mobileNumber
  if (cmsCandidate.appliedFor) candidate.appliedFor = cmsCandidate.appliedFor
  if (cmsCandidate.education) candidate.education = cmsCandidate.education
  candidate.selectionStatus = selectionFromCms(cmsCandidate.successRemarks)
  await candidate.save()
}

module.exports = {
  syncCmsFromCandidate,
  syncCandidateFromCms
}
