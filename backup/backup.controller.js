const BackupAuditLog = require('./models/BackupAuditLog.model')
const { auditLog } = require('./backup.audit')
const {
  consumeDownloadToken,
  generateBackupAccessToken,
  generateDownloadToken
} = require('./backup.security')
const {
  addSummarySheet,
  createWorkbook
} = require('./utils/excel.builder')
const { generateBusinessAdvisorSheet } = require('./generators/businessAdvisor.generator')
const { generateCandidateSheet } = require('./generators/candidate.generator')
const { generateCrmSheet } = require('./generators/crm.generator')
const { formatDate } = require('./utils/sanitizer')

const toIndianDateForFile = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'date'
  return date.toLocaleDateString('en-IN').replace(/\//g, '-')
}

const createBackupSession = async (req, res) => {
  try {
    if (req.user?.role !== 'superAdmin') {
      await auditLog({
        adminId: req.user?._id,
        adminEmail: req.user?.email || 'unknown',
        adminRole: req.user?.role || 'unknown',
        action: 'UNAUTHORIZED_ATTEMPT',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'unauthorized',
        errorMsg: 'Backup session restricted to Super Admin'
      })

      return res.status(403).json({ success: false, message: 'Backup access restricted to Super Admin' })
    }

    return res.status(200).json({
      success: true,
      backupToken: generateBackupAccessToken(req.user),
      expiresIn: 300
    })
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Backup module is not configured' })
  }
}

const createBackupWorkbook = async ({ adminId, panels, fromDate, toDate }) => {
  const exportedBy = `Super Admin (${adminId})`
  const workbook = createWorkbook('System Backup', exportedBy, { from: fromDate, to: toDate })
  const recordCounts = {
    candidateManagement: 0,
    businessAdvisor: 0,
    crm: 0,
    total: 0
  }

  const summarySheet = addSummarySheet(workbook, {
    exportedBy,
    fromDate: formatDate(fromDate),
    toDate: formatDate(toDate),
    counts: recordCounts
  })

  if (panels.includes('candidate_management')) {
    const result = await generateCandidateSheet(workbook, fromDate, toDate)
    recordCounts.candidateManagement =
      Number(result.totalCandidates || 0) +
      Number(result.totalCompanies || 0) +
      Number(result.totalInterviews || 0)
  }

  if (panels.includes('business_advisor')) {
    const result = await generateBusinessAdvisorSheet(workbook, fromDate, toDate)
    recordCounts.businessAdvisor =
      Number(result.totalAdvisors || 0) +
      Number(result.totalCandidates || 0) +
      Number(result.totalCompanies || 0) +
      Number(result.totalPlacements || 0)
  }

  if (panels.includes('crm')) {
    const result = await generateCrmSheet(workbook, fromDate, toDate)
    recordCounts.crm =
      Number(result.totalCrm || 0) +
      Number(result.totalEmployees || 0) +
      Number(result.totalCallLogs || 0)
  }

  recordCounts.total =
    Number(recordCounts.candidateManagement || 0) +
    Number(recordCounts.businessAdvisor || 0) +
    Number(recordCounts.crm || 0)

  summarySheet.getCell('B9').value = recordCounts.candidateManagement
  summarySheet.getCell('B10').value = recordCounts.businessAdvisor
  summarySheet.getCell('B11').value = recordCounts.crm
  summarySheet.getCell('B13').value = recordCounts.total

  return {
    workbook,
    recordCounts
  }
}

const requestExport = async (req, res) => {
  const startTime = Date.now()
  const admin = req.backupUser
  const { fromDate, toDate, panels } = req.body

  try {
    const downloadToken = generateDownloadToken(admin._id, panels, fromDate, toDate)

    await auditLog({
      adminId: admin._id,
      adminEmail: admin.email,
      adminRole: admin.role,
      action: 'EXPORT_REQUESTED',
      panels,
      fromDate,
      toDate,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
      durationMs: Date.now() - startTime
    })

    return res.status(200).json({
      success: true,
      message: 'Export ready. Use download token within 60 seconds.',
      downloadToken,
      expiresIn: 60,
      downloadUrl: `/backup/download?token=${downloadToken}`
    })
  } catch (error) {
    await auditLog({
      adminId: admin._id,
      adminEmail: admin.email,
      adminRole: admin.role,
      action: 'EXPORT_FAILED',
      panels,
      fromDate,
      toDate,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed',
      errorMsg: error.message,
      durationMs: Date.now() - startTime
    })

    return res.status(500).json({ success: false, message: 'Export failed. Please try again.' })
  }
}

const downloadExport = async (req, res) => {
  const token = req.query?.token
  if (!token) {
    return res.status(400).json({ success: false, message: 'Download token required' })
  }

  const result = consumeDownloadToken(token)
  if (!result.valid) {
    return res.status(401).json({ success: false, message: result.reason })
  }

  const startTime = Date.now()
  const { adminId, panels, fromDate, toDate } = result.data

  try {
    const { workbook, recordCounts } = await createBackupWorkbook({ adminId, panels, fromDate, toDate })
    const filename = `Backup_${toIndianDateForFile(fromDate)}_to_${toIndianDateForFile(toDate)}_${Date.now()}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    await auditLog({
      adminId,
      adminEmail: `Admin(${adminId})`,
      adminRole: 'super_admin',
      action: 'EXPORT_GENERATED',
      panels,
      fromDate,
      toDate,
      recordCounts,
      status: 'success',
      durationMs: Date.now() - startTime
    })

    await workbook.xlsx.write(res)
    res.end()

    await auditLog({
      adminId,
      adminEmail: `Admin(${adminId})`,
      adminRole: 'super_admin',
      action: 'EXPORT_DOWNLOADED',
      panels,
      fromDate,
      toDate,
      recordCounts,
      status: 'success',
      durationMs: Date.now() - startTime
    })
  } catch (error) {
    await auditLog({
      adminId,
      adminEmail: `Admin(${adminId})`,
      adminRole: 'super_admin',
      action: 'EXPORT_FAILED',
      panels,
      fromDate,
      toDate,
      status: 'failed',
      errorMsg: error.message,
      durationMs: Date.now() - startTime
    })

    if (!res.headersSent) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: 'Download failed. Please request a new export.'
      })
    }
  }
}

const getAuditHistory = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))

    const [logs, total] = await Promise.all([
      BackupAuditLog.find({ adminId: req.backupUser._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BackupAuditLog.countDocuments({ adminId: req.backupUser._id })
    ])

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch audit history' })
  }
}

module.exports = { createBackupSession, requestExport, downloadExport, getAuditHistory }
