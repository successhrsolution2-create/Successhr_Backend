require('dotenv').config()

const mongoose = require('mongoose')
const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')
const CmsInterview = require('../models/cms/CmsInterview')
const CmsRemark = require('../models/cms/CmsRemark')
const CmsPdfShare = require('../models/cms/CmsPdfShare')
const Placement = require('../models/Placement')

const apply = process.argv.includes('--apply')

const testNameRegex = /^(Import Header Row|Cost Import|IDOR Temp|Imported Candidate Row|Demo Candidate|Test Candidate|QA Test)/i
const testEmailRegex = /(@example\.com$|^import\.header\.row\.|^cost\.import\.|^idor\.temp\.)/i

const cmsCandidateTestQuery = {
  $or: [
    { emailId: testEmailRegex },
    { fullName: testNameRegex }
  ]
}

const candidateTestQuery = {
  $or: [
    { emailId: testEmailRegex },
    { candidateName: testNameRegex }
  ]
}

const ids = (docs) => docs.map((doc) => doc._id)

const preview = (label, docs, nameField) => {
  console.log(`\n${label}: ${docs.length}`)
  docs.slice(0, 20).forEach((doc) => {
    console.log(`- ${doc[nameField] || doc.emailId || doc._id} ${doc.emailId ? `<${doc.emailId}>` : ''}`)
  })
  if (docs.length > 20) console.log(`...and ${docs.length - 20} more`)
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing in backend/.env')
  }

  await mongoose.connect(process.env.MONGODB_URI)

  const [cmsCandidates, candidates] = await Promise.all([
    CmsCandidate.find(cmsCandidateTestQuery).select('_id fullName emailId').lean(),
    Candidate.find(candidateTestQuery).select('_id candidateName emailId').lean()
  ])

  const cmsCandidateIds = ids(cmsCandidates)
  const candidateIds = ids(candidates)

  const [cmsInterviewCount, cmsRemarkCount, cmsPdfShareCount, placementCount] = await Promise.all([
    cmsCandidateIds.length ? CmsInterview.countDocuments({ candidateId: { $in: cmsCandidateIds } }) : 0,
    cmsCandidateIds.length ? CmsRemark.countDocuments({ candidateId: { $in: cmsCandidateIds } }) : 0,
    cmsCandidateIds.length ? CmsPdfShare.countDocuments({ candidateId: { $in: cmsCandidateIds } }) : 0,
    candidateIds.length ? Placement.countDocuments({ candidateId: { $in: candidateIds } }) : 0
  ])

  preview('CMS test candidates to delete', cmsCandidates, 'fullName')
  preview('BA/reference test candidates to delete', candidates, 'candidateName')
  console.log('\nLinked records to delete:')
  console.log(`- CMS interviews: ${cmsInterviewCount}`)
  console.log(`- CMS remarks: ${cmsRemarkCount}`)
  console.log(`- CMS PDF shares: ${cmsPdfShareCount}`)
  console.log(`- Placements: ${placementCount}`)

  if (!apply) {
    console.log('\nDry run only. Run this to delete:')
    console.log('npm run cleanup:test-data -- --apply')
    return
  }

  const results = {}

  if (cmsCandidateIds.length) {
    results.cmsInterviews = await CmsInterview.deleteMany({ candidateId: { $in: cmsCandidateIds } })
    results.cmsRemarks = await CmsRemark.deleteMany({ candidateId: { $in: cmsCandidateIds } })
    results.cmsPdfShares = await CmsPdfShare.deleteMany({ candidateId: { $in: cmsCandidateIds } })
    results.cmsCandidates = await CmsCandidate.deleteMany({ _id: { $in: cmsCandidateIds } })
  }

  if (candidateIds.length) {
    results.placements = await Placement.deleteMany({ candidateId: { $in: candidateIds } })
    results.candidates = await Candidate.deleteMany({ _id: { $in: candidateIds } })
  }

  console.log('\nDeleted:')
  Object.entries(results).forEach(([label, result]) => {
    console.log(`- ${label}: ${result.deletedCount || 0}`)
  })
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
