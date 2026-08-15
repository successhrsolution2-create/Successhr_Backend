const CmsCandidate = require('../../models/cms/CmsCandidate')

const exportCandidates = async (req, res) => {
  const { startDate, endDate } = req.query

  const query = {}

  if (req.user.role === 'businessAdvisor') {
    query.advisor = req.user._id
  }

  if (startDate && endDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    query.createdAt = { $gte: start, $lte: end }
  } else if (startDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    query.createdAt = { $gte: start }
  } else if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    query.createdAt = { $lte: end }
  }

  const candidates = await CmsCandidate.find(query).sort({ createdAt: -1 }).lean()

  res.json(candidates)
}

module.exports = {
  exportCandidates
}
