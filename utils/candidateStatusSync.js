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
  if (candidate?._id) {
    const linked = await CmsCandidate.findOne({ sourceCandidateId: candidate._id }).sort({ createdAt: -1 })
    if (linked) return linked
  }

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

const copyDocuments = (documents = []) =>
  (documents || []).map((doc) => ({
    documentType: doc.documentType,
    documentLabel: doc.documentLabel,
    fileName: doc.fileName,
    fileUrl: doc.fileUrl,
    mimeType: doc.mimeType,
    size: doc.size,
    uploadedAt: doc.uploadedAt
  }))

const syncCmsFromCandidate = async (candidateOrId) => {
  const candidate =
    typeof candidateOrId === 'string' ? await Candidate.findById(candidateOrId) : candidateOrId
  if (!candidate) return

  const cmsCandidate = await findCmsByCandidate(candidate)
  if (!cmsCandidate) return

  if (candidate._id && !cmsCandidate.sourceCandidateId) {
    cmsCandidate.sourceCandidateId = candidate._id
  }

  const mapped = cmsFromSelection(candidate.selectionStatus)
  if (candidate.candidateName) cmsCandidate.fullName = candidate.candidateName
  if (candidate.formMeta) cmsCandidate.formMeta = candidate.formMeta
  if (candidate.collegeName !== undefined) cmsCandidate.collegeName = candidate.collegeName
  if (candidate.mobileNumber) cmsCandidate.mobileNumber = candidate.mobileNumber
  if (candidate.whatsappNo !== undefined) cmsCandidate.whatsappNo = candidate.whatsappNo
  if (candidate.emailId !== undefined) cmsCandidate.emailId = candidate.emailId
  if (candidate.appliedFor) cmsCandidate.appliedFor = candidate.appliedFor
  if (candidate.education) cmsCandidate.education = candidate.education
  if (candidate.preferredJobLocation !== undefined) cmsCandidate.preferredJobLocation = candidate.preferredJobLocation
  if (candidate.totalExperience !== undefined) cmsCandidate.totalExperience = candidate.totalExperience
  if (candidate.experienceDepartment !== undefined) cmsCandidate.experienceDepartment = candidate.experienceDepartment
  if (candidate.currentSalary !== undefined) cmsCandidate.currentSalary = candidate.currentSalary
  if (candidate.expectedSalary !== undefined) cmsCandidate.expectedSalary = candidate.expectedSalary
  if (candidate.noticePeriod !== undefined) cmsCandidate.noticePeriod = String(candidate.noticePeriod)
  if (candidate.currentJobLocation !== undefined) cmsCandidate.currentJobLocation = candidate.currentJobLocation
  if (candidate.reasonForJobChange !== undefined) cmsCandidate.reasonForJobChange = candidate.reasonForJobChange
  if (candidate.familyDetails) cmsCandidate.familyDetails = candidate.familyDetails
  if (candidate.goalAim !== undefined) cmsCandidate.goalAim = candidate.goalAim
  if (candidate.candidateVisits !== undefined) cmsCandidate.candidateVisits = candidate.candidateVisits
  if (candidate.successInfo !== undefined) cmsCandidate.successInfo = candidate.successInfo
  if (candidate.documents !== undefined) cmsCandidate.documents = copyDocuments(candidate.documents)

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
  if (cmsCandidate.formMeta) candidate.formMeta = cmsCandidate.formMeta
  if (cmsCandidate.collegeName !== undefined) candidate.collegeName = cmsCandidate.collegeName
  if (cmsCandidate.mobileNumber) candidate.mobileNumber = cmsCandidate.mobileNumber
  if (cmsCandidate.whatsappNo !== undefined) candidate.whatsappNo = cmsCandidate.whatsappNo
  if (cmsCandidate.emailId !== undefined) candidate.emailId = cmsCandidate.emailId
  if (cmsCandidate.appliedFor) candidate.appliedFor = cmsCandidate.appliedFor
  if (cmsCandidate.education) candidate.education = cmsCandidate.education
  if (cmsCandidate.preferredJobLocation !== undefined) candidate.preferredJobLocation = cmsCandidate.preferredJobLocation
  if (cmsCandidate.totalExperience !== undefined) candidate.totalExperience = cmsCandidate.totalExperience
  if (cmsCandidate.experienceDepartment !== undefined) candidate.experienceDepartment = cmsCandidate.experienceDepartment
  if (cmsCandidate.currentSalary !== undefined) candidate.currentSalary = cmsCandidate.currentSalary
  if (cmsCandidate.expectedSalary !== undefined) candidate.expectedSalary = cmsCandidate.expectedSalary
  if (cmsCandidate.noticePeriod !== undefined) candidate.noticePeriod = Number(cmsCandidate.noticePeriod) || undefined
  if (cmsCandidate.currentJobLocation !== undefined) candidate.currentJobLocation = cmsCandidate.currentJobLocation
  if (cmsCandidate.reasonForJobChange !== undefined) candidate.reasonForJobChange = cmsCandidate.reasonForJobChange
  if (cmsCandidate.familyDetails) candidate.familyDetails = cmsCandidate.familyDetails
  if (cmsCandidate.goalAim !== undefined) candidate.goalAim = cmsCandidate.goalAim
  if (cmsCandidate.candidateVisits !== undefined) candidate.candidateVisits = cmsCandidate.candidateVisits
  if (cmsCandidate.successInfo !== undefined) candidate.successInfo = cmsCandidate.successInfo
  if (cmsCandidate.documents !== undefined) candidate.documents = copyDocuments(cmsCandidate.documents)
  candidate.selectionStatus = selectionFromCms(cmsCandidate.successRemarks)
  await candidate.save()
}

module.exports = {
  syncCmsFromCandidate,
  syncCandidateFromCms
}
