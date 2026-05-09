const CmsCandidate = require('../models/cms/CmsCandidate')

const codePrefixFromDate = (value) => {
  const date = value ? new Date(value) : new Date()
  const year = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `C${year}${month}`
}

const nextCandidateCode = async (createdAt) => {
  const prefix = codePrefixFromDate(createdAt)
  const regex = new RegExp(`^${prefix}\\d{4}$`)

  const latest = await CmsCandidate.findOne({ candidateCode: regex })
    .sort({ candidateCode: -1 })
    .select('candidateCode')
    .lean()

  const latestNumber = latest?.candidateCode ? Number(latest.candidateCode.slice(-4)) : 0
  const nextNumber = String((Number.isFinite(latestNumber) ? latestNumber : 0) + 1).padStart(4, '0')
  return `${prefix}${nextNumber}`
}

module.exports = { nextCandidateCode }
