const Candidate = require('../models/Candidate')

const getCandidateChartData = async (req, res) => {
  try {
    const { filter = 'daily' } = req.query
    const now = new Date()
    const dataPoints = []
    let startDate = new Date()

    if (filter === 'daily') {
      // Last 14 days
      startDate.setDate(now.getDate() - 13)
      startDate.setHours(0, 0, 0, 0)
      for (let i = 0; i < 14; i++) {
        const d = new Date(startDate)
        d.setDate(startDate.getDate() + i)
        // format local time to avoid timezone offset issue
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        dataPoints.push({
          key: `${y}-${m}-${day}`,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count: 0
        })
      }
    } else if (filter === 'weekly') {
      // Last 12 weeks
      startDate.setDate(now.getDate() - (11 * 7)) // Go back 11 weeks
      // Adjust to start of week (Monday)
      const day = startDate.getDay()
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
      startDate.setDate(diff)
      startDate.setHours(0, 0, 0, 0)

      for (let i = 0; i < 12; i++) {
        const d = new Date(startDate)
        d.setDate(startDate.getDate() + (i * 7))
        // end of week
        const dEnd = new Date(d)
        dEnd.setDate(dEnd.getDate() + 6)
        dEnd.setHours(23, 59, 59, 999)
        dataPoints.push({
          key: `Week ${i}`, // Just a unique key
          label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          startDate: new Date(d),
          endDate: new Date(dEnd),
          count: 0
        })
      }
    } else if (filter === 'monthly') {
      // Last 12 months
      startDate.setMonth(now.getMonth() - 11)
      startDate.setDate(1)
      startDate.setHours(0, 0, 0, 0)

      for (let i = 0; i < 12; i++) {
        const d = new Date(startDate)
        d.setMonth(startDate.getMonth() + i)
        dataPoints.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          count: 0
        })
      }
    }

    const candidates = await Candidate.find({
      createdAt: { $gte: startDate }
    }).select('createdAt').lean()

    candidates.forEach(candidate => {
      const cDate = new Date(candidate.createdAt)
      
      if (filter === 'daily') {
        const y = cDate.getFullYear()
        const m = String(cDate.getMonth() + 1).padStart(2, '0')
        const day = String(cDate.getDate()).padStart(2, '0')
        const key = `${y}-${m}-${day}`
        const pt = dataPoints.find(p => p.key === key)
        if (pt) pt.count++
      } else if (filter === 'weekly') {
        const pt = dataPoints.find(p => cDate >= p.startDate && cDate <= p.endDate)
        if (pt) pt.count++
      } else if (filter === 'monthly') {
        const key = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`
        const pt = dataPoints.find(p => p.key === key)
        if (pt) pt.count++
      }
    })

    // Clean up unnecessary fields
    const formattedData = dataPoints.map(pt => ({
      label: pt.label,
      candidates: pt.count
    }))

    res.json(formattedData)
  } catch (error) {
    console.error('Error fetching chart data:', error)
    res.status(500).json({ message: 'Error fetching chart data' })
  }
}

module.exports = {
  getCandidateChartData
}
