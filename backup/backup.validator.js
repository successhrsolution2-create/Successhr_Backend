const { MAX_RANGE_DAYS, validateDateRange } = require('./utils/dateValidator')

const ALLOWED_PANELS = new Set(['candidate_management', 'business_advisor', 'crm'])

const validateExportInput = (req, res, next) => {
  const dateRange = validateDateRange(req.body || {})
  if (!dateRange.valid) return res.status(400).json({ success: false, message: dateRange.message })

  const panels = Array.isArray(req.body?.panels)
    ? [...new Set(req.body.panels.map((panel) => String(panel || '').trim()).filter((panel) => ALLOWED_PANELS.has(panel)))]
    : []

  if (!panels.length) {
    return res.status(400).json({
      success: false,
      message: 'panels must include at least one of candidate_management, business_advisor, crm'
    })
  }

  req.body = {
    fromDate: dateRange.fromDateString,
    toDate: dateRange.toDateString,
    panels
  }

  return next()
}

module.exports = { ALLOWED_PANELS, MAX_RANGE_DAYS, validateExportInput }
