const Candidate = require('../models/Candidate')
const CmsCandidate = require('../models/cms/CmsCandidate')

const getCandidateChartData = async (req, res) => {
  try {
    const { filter = 'daily' } = req.query
    const now = new Date()
    const dataPoints = []
    let startDate = new Date()

    if (filter === 'daily') {
      // Last 14 days up to today
      startDate.setDate(now.getDate() - 13)
      startDate.setHours(0, 0, 0, 0)
      for (let i = 0; i < 14; i++) {
        const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i, 0, 0, 0, 0)
        const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i, 23, 59, 59, 999)
        const y = dayStart.getFullYear()
        const m = String(dayStart.getMonth() + 1).padStart(2, '0')
        const day = String(dayStart.getDate()).padStart(2, '0')
        dataPoints.push({
          key: `${y}-${m}-${day}`,
          label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          startDate: dayStart,
          endDate: dayEnd,
          count: 0
        })
      }
    } else if (filter === 'weekly') {
      // Last 12 weeks
      startDate.setDate(now.getDate() - (11 * 7))
      const day = startDate.getDay()
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
      startDate.setDate(diff)
      startDate.setHours(0, 0, 0, 0)

      for (let i = 0; i < 12; i++) {
        const weekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + (i * 7), 0, 0, 0, 0)
        const weekEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + (i * 7) + 6, 23, 59, 59, 999)
        dataPoints.push({
          key: `Week ${i + 1}`,
          label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          startDate: weekStart,
          endDate: weekEnd,
          count: 0
        })
      }
    } else if (filter === 'monthly') {
      // Last 12 months
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)

      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1, 0, 0, 0, 0)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - 11 + i + 1, 0, 23, 59, 59, 999)
        dataPoints.push({
          key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
          label: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          fullDate: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          startDate: monthStart,
          endDate: monthEnd,
          count: 0
        })
      }
    }

    // Query both CmsCandidate and Candidate to cover all registration sources
    const [cmsCandidates, studentCandidates] = await Promise.all([
      CmsCandidate.find({ createdAt: { $gte: startDate } }).select('createdAt sourceCandidateId mobileNumber').lean(),
      Candidate.find({ createdAt: { $gte: startDate } }).select('createdAt mobileNumber').lean()
    ])

    const linkedSourceIds = new Set(
      cmsCandidates
        .filter((c) => c.sourceCandidateId)
        .map((c) => String(c.sourceCandidateId))
    )

    // Deduplicate linked candidates
    const allCandidateDates = [
      ...cmsCandidates.map((c) => new Date(c.createdAt)),
      ...studentCandidates
        .filter((s) => !linkedSourceIds.has(String(s._id)))
        .map((s) => new Date(s.createdAt))
    ]

    allCandidateDates.forEach((cDate) => {
      const time = cDate.getTime()
      if (isNaN(time)) return
      const pt = dataPoints.find((p) => time >= p.startDate.getTime() && time <= p.endDate.getTime())
      if (pt) pt.count++
    })

    const formattedData = dataPoints.map((pt) => ({
      label: pt.label,
      fullDate: pt.fullDate,
      candidates: pt.count
    }))

    res.json(formattedData)
  } catch (error) {
    console.error('Error fetching chart data:', error)
    res.status(500).json({ message: 'Error fetching chart data' })
  }
}

const getCandidateDistributionData = async (req, res) => {
  try {
    const { filter = 'daily' } = req.query
    const now = new Date()
    let startDate = new Date()

    if (filter === 'daily' || filter === 'today') {
      startDate.setHours(0, 0, 0, 0)
    } else if (filter === 'weekly') {
      startDate.setDate(now.getDate() - 7)
      startDate.setHours(0, 0, 0, 0)
    } else if (filter === 'monthly') {
      startDate.setDate(now.getDate() - 30)
      startDate.setHours(0, 0, 0, 0)
    } else if (filter === 'all') {
      startDate = new Date(0)
    }

    const query = { createdAt: { $gte: startDate } }

    const [cmsCandidates, studentCandidates] = await Promise.all([
      CmsCandidate.find(query).select('createdAt source intakeType sourceCandidateId').lean(),
      Candidate.find(query).select('createdAt source reference_type business_advisor_id').lean()
    ])

    const linkedSourceIds = new Set(
      cmsCandidates
        .filter((c) => c.sourceCandidateId)
        .map((c) => String(c.sourceCandidateId))
    )

    let publicApplyCount = 0
    let businessAdvisorCount = 0
    let cmsAdminCount = 0

    cmsCandidates.forEach((c) => {
      if (c.source === 'public_form' && c.intakeType !== 'advisor') {
        publicApplyCount++
      } else if (c.intakeType === 'advisor' || c.sourceCandidateId || (c.source === 'public_form' && c.intakeType === 'advisor')) {
        businessAdvisorCount++
      } else {
        cmsAdminCount++
      }
    })

    studentCandidates.forEach((s) => {
      if (linkedSourceIds.has(String(s._id))) return
      if (s.source === 'public_form' && !s.reference_type && !s.business_advisor_id) {
        publicApplyCount++
      } else {
        businessAdvisorCount++
      }
    })

    const total = publicApplyCount + businessAdvisorCount + cmsAdminCount

    const distribution = [
      {
        name: 'Public Apply Form',
        key: 'public_form',
        value: publicApplyCount,
        color: '#3b82f6',
        description: 'Direct website registrations'
      },
      {
        name: 'Business Advisor',
        key: 'advisor',
        value: businessAdvisorCount,
        color: '#6366f1',
        description: 'Advisor referrals & entries'
      },
      {
        name: 'CMS Admin',
        key: 'cms',
        value: cmsAdminCount,
        color: '#10b981',
        description: 'Direct CMS admin intake'
      }
    ]

    res.json({
      filter,
      total,
      distribution
    })
  } catch (error) {
    console.error('Error fetching distribution data:', error)
    res.status(500).json({ message: 'Error fetching distribution data' })
  }
}

module.exports = {
  getCandidateChartData,
  getCandidateDistributionData
}


