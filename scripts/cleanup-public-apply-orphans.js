require('dotenv').config()
const mongoose = require('mongoose')
const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsInterview = require('../models/cms/CmsInterview')
const CmsRemark = require('../models/cms/CmsRemark')
const Placement = require('../models/Placement')

const args = process.argv.slice(2)
const shouldApply = args.includes('--apply')

const readArg = (name) => {
  const prefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const mobile = String(readArg('--mobile') || '').replace(/\D/g, '')

const formatCandidate = (candidate) =>
  [
    candidate._id,
    candidate.mobileNumber,
    candidate.candidateName || candidate.fullName,
    candidate.candidateCode
  ]
    .filter(Boolean)
    .join(' | ')

async function findOrphans() {
  const cmsQuery = { sourceCandidateId: { $exists: true, $ne: null } }
  const candidateQuery = { source: 'public_form' }
  if (mobile) {
    cmsQuery.mobileNumber = mobile
    candidateQuery.mobileNumber = mobile
  }

  const cmsCandidates = await CmsCandidate.find(cmsQuery)
    .select('_id sourceCandidateId candidateCode fullName mobileNumber')
    .lean()

  const orphanCmsCandidates = []
  for (const cmsCandidate of cmsCandidates) {
    const linkedCandidate = await Candidate.findById(cmsCandidate.sourceCandidateId).select('_id').lean()
    if (!linkedCandidate) orphanCmsCandidates.push(cmsCandidate)
  }

  const candidates = await Candidate.find(candidateQuery)
    .select('_id candidateName mobileNumber source')
    .lean()

  const orphanDashboardCandidates = []
  for (const candidate of candidates) {
    const linkedCmsCandidate = await CmsCandidate.findOne({ sourceCandidateId: candidate._id }).select('_id').lean()
    if (!linkedCmsCandidate) orphanDashboardCandidates.push(candidate)
  }

  return { orphanCmsCandidates, orphanDashboardCandidates }
}

async function removeOrphans({ orphanCmsCandidates, orphanDashboardCandidates }) {
  for (const cmsCandidate of orphanCmsCandidates) {
    await Promise.all([
      CmsInterview.deleteMany({ candidateId: cmsCandidate._id }),
      CmsRemark.deleteOne({ candidateId: cmsCandidate._id }),
      CmsCandidate.deleteOne({ _id: cmsCandidate._id })
    ])
  }

  for (const candidate of orphanDashboardCandidates) {
    await Promise.all([
      Placement.deleteMany({
        $or: [{ candidateId: candidate._id }, { studentId: candidate._id }]
      }),
      Candidate.deleteOne({ _id: candidate._id })
    ])
  }
}

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required')
  if (mobile && mobile.length !== 10) throw new Error('--mobile must contain a 10 digit mobile number')

  await mongoose.connect(uri)

  const result = await findOrphans()
  const total = result.orphanCmsCandidates.length + result.orphanDashboardCandidates.length

  console.log(`Mode: ${shouldApply ? 'apply' : 'dry-run'}`)
  console.log(`Mobile filter: ${mobile || 'none'}`)
  console.log(`Orphan CMS candidates: ${result.orphanCmsCandidates.length}`)
  result.orphanCmsCandidates.forEach((candidate) => console.log(`  CMS: ${formatCandidate(candidate)}`))
  console.log(`Orphan dashboard candidates: ${result.orphanDashboardCandidates.length}`)
  result.orphanDashboardCandidates.forEach((candidate) => console.log(`  Dashboard: ${formatCandidate(candidate)}`))

  if (!shouldApply) {
    console.log('No records were deleted. Re-run with --apply to delete the listed orphan records.')
    return
  }

  await removeOrphans(result)
  console.log(`Deleted ${total} orphan record${total === 1 ? '' : 's'}.`)
}

run()
  .catch((error) => {
    console.error('Cleanup failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
