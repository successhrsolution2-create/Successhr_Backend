const CmsCandidate = require('../models/cms/CmsCandidate')

const candidateCodePrefix = 'SC-'
const sequentialCandidateCodeRegex = /^SC-(\d+)$/
const legacyCandidateCodeRegex = /^C\d{4}(\d{4})$/

const candidateCodeToNumber = (value) => {
  const code = String(value || '').trim().toUpperCase()
  const sequentialMatch = code.match(sequentialCandidateCodeRegex)
  if (sequentialMatch) return Number(sequentialMatch[1]) || 0

  const legacyMatch = code.match(legacyCandidateCodeRegex)
  if (legacyMatch) return Number(legacyMatch[1]) || 0

  return 0
}

const nextCandidateCodes = async (count = 1) => {
  const safeCount = Number(count)
  if (!Number.isInteger(safeCount) || safeCount < 1) return []

  const [codedCandidates, totalCandidates] = await Promise.all([
    CmsCandidate.find({
      candidateCode: {
        $regex: /^(SC-\d+|C\d{8})$/i
      }
    })
      .select('candidateCode')
      .lean(),
    CmsCandidate.countDocuments()
  ])

  const latestNumber = codedCandidates.reduce(
    (highest, candidate) => Math.max(highest, candidateCodeToNumber(candidate.candidateCode)),
    0
  )
  const nextNumber = Math.max(latestNumber, totalCandidates) + 1

  return Array.from({ length: safeCount }, (_item, index) => `${candidateCodePrefix}${nextNumber + index}`)
}

const nextCandidateCode = async () => {
  const [code] = await nextCandidateCodes(1)
  return code
}

module.exports = {
  candidateCodePrefix,
  candidateCodeToNumber,
  nextCandidateCode,
  nextCandidateCodes
}
