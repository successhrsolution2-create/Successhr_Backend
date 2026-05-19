require('dotenv').config()
const mongoose = require('mongoose')
const CmsCandidate = require('../models/cms/CmsCandidate')

const isWriteMode = process.argv.includes('--write')

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(uri)

  const candidates = await CmsCandidate.find({})
    .sort({ createdAt: 1, _id: 1 })
    .select('_id candidateCode fullName createdAt')
    .lean()

  if (!candidates.length) {
    console.log('No CMS candidates found.')
    return
  }

  const planned = candidates.map((candidate, index) => ({
    id: candidate._id,
    fullName: candidate.fullName || '',
    oldCode: candidate.candidateCode || '',
    newCode: `SC-${index + 1}`
  }))

  console.table(planned.map(({ fullName, oldCode, newCode }) => ({ fullName, oldCode, newCode })))

  if (!isWriteMode) {
    console.log(`Dry run only. Re-run with --write to update ${planned.length} candidate code(s).`)
    return
  }

  await CmsCandidate.bulkWrite(
    planned.map(({ id }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { candidateCode: `SC-TEMP-${id}` } }
      }
    }))
  )

  await CmsCandidate.bulkWrite(
    planned.map(({ id, newCode }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { candidateCode: newCode } }
      }
    }))
  )

  console.log(`Updated ${planned.length} CMS candidate code(s) to SC sequence.`)
}

run()
  .catch((error) => {
    console.error('Candidate code resequence failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await mongoose.disconnect()
    } catch (_error) {
      // ignore disconnect errors
    }
  })
