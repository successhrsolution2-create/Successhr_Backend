const CrmCallLog = require('../../crm/models/CrmCallLog.model')
const CrmCandidate = require('../../crm/models/CrmCandidate.model')
const CrmUser = require('../../crm/models/CrmUser.model')
const {
  addSummaryRows,
  addWorksheetFromCursor,
  dateRangeMatch,
  endOfDay,
  idString,
  yesNo
} = require('../utils/generatorHelpers')
const { formatDate, sanitizeRow } = require('../utils/sanitizer')

const percent = (count, total) => (total ? `${((Number(count || 0) / total) * 100).toFixed(1)}%` : '0%')

const callLogDateMatch = (fromDate, toDate) => ({
  calledAt: {
    $gte: new Date(fromDate),
    $lte: endOfDay(toDate)
  }
})

const generateCrmSheet = async (workbook, fromDate, toDate) => {
  const dateMatch = dateRangeMatch(fromDate, toDate)
  const candidateDateMatch = { ...dateMatch, isActive: true }
  const logDateMatch = callLogDateMatch(fromDate, toDate)

  const callCounts = await CrmCallLog.aggregate([
    { $match: logDateMatch },
    { $lookup: { from: 'crm_candidates', localField: 'candidateId', foreignField: '_id', as: 'candidate' } },
    { $unwind: '$candidate' },
    { $match: { 'candidate.isActive': true } },
    {
      $group: {
        _id: '$candidateId',
        count: { $sum: 1 },
        lastCall: { $max: '$calledAt' }
      }
    }
  ])
  const callCountMap = new Map(
    callCounts.map((item) => [
      idString(item._id),
      {
        count: item.count || 0,
        lastCall: item.lastCall
      }
    ])
  )

  const { count: totalEmployees } = await addWorksheetFromCursor({
    workbook,
    name: 'CRM - Employees',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Employee ID', key: 'id', width: 26 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'Active', key: 'isActive', width: 10 },
      { header: 'Created By', key: 'createdBy', width: 26 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ],
    cursor: CrmUser.find({ role: 'crm_employee', ...dateMatch })
      .select('_id name email role isActive createdBy createdAt updatedAt')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .cursor(),
    autoFilterTo: 'I1',
    tabColor: 'FF00B050',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        name: doc.name,
        email: doc.email,
        role: doc.role,
        isActive: yesNo(doc.isActive),
        createdBy: doc.createdBy?.name || idString(doc.createdBy),
        createdAt: formatDate(doc.createdAt),
        updatedAt: formatDate(doc.updatedAt)
      })
  })

  const { count: totalCrm } = await addWorksheetFromCursor({
    workbook,
    name: 'CRM - Candidates',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Record ID', key: 'id', width: 26 },
      { header: 'Candidate Name', key: 'candidateName', width: 25 },
      { header: 'Mobile', key: 'mobileNumber', width: 15 },
      { header: 'Education', key: 'education', width: 22 },
      { header: 'Job No', key: 'jobNo', width: 14 },
      { header: 'Job Profile', key: 'jobProfile', width: 24 },
      { header: 'Interested', key: 'interested', width: 13 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Availability', key: 'availabilityForInterview', width: 22 },
      { header: 'Interview Time', key: 'interviewTime', width: 20 },
      { header: 'Recruiter', key: 'recruiterName', width: 24 },
      { header: 'Recruiter Email', key: 'recruiterEmail', width: 30 },
      { header: 'Remark', key: 'overallCallingRemark', width: 35 },
      { header: 'Class', key: 'candidateClass', width: 12 },
      { header: 'Registration', key: 'registrationInfo', width: 15 },
      { header: 'Call Status', key: 'callStatus', width: 16 },
      { header: 'Active', key: 'isActive', width: 10 },
      { header: 'Calls In Range', key: 'callsInRange', width: 16 },
      { header: 'Last Call In Range', key: 'lastCallInRange', width: 22 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ],
    cursor: CrmCandidate.find(candidateDateMatch)
      .populate('recruiterId', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .cursor(),
    autoFilterTo: 'V1',
    tabColor: 'FF0070C0',
    mapRow: (doc, index) => {
      const callInfo = callCountMap.get(idString(doc._id)) || {}
      return sanitizeRow({
        sno: index,
        id: idString(doc._id),
        candidateName: doc.candidateName,
        mobileNumber: doc.mobileNumber,
        education: doc.education,
        jobNo: doc.jobNo,
        jobProfile: doc.jobProfile,
        interested: doc.interested?.status,
        reason: doc.interested?.reason,
        availabilityForInterview: doc.availabilityForInterview,
        interviewTime: doc.interviewTime,
        recruiterName: doc.recruiterId?.name,
        recruiterEmail: doc.recruiterId?.email,
        overallCallingRemark: doc.overallCallingRemark,
        candidateClass: doc.candidateClass,
        registrationInfo: doc.registrationInfo,
        callStatus: doc.callStatus,
        isActive: yesNo(doc.isActive),
        callsInRange: callInfo.count || 0,
        lastCallInRange: formatDate(callInfo.lastCall),
        createdAt: formatDate(doc.createdAt),
        updatedAt: formatDate(doc.updatedAt)
      })
    }
  })

  const { count: totalCallLogs } = await addWorksheetFromCursor({
    workbook,
    name: 'CRM - Call Logs',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Log ID', key: 'id', width: 26 },
      { header: 'Candidate', key: 'candidateName', width: 25 },
      { header: 'Mobile', key: 'mobileNumber', width: 15 },
      { header: 'Recruiter', key: 'recruiterName', width: 24 },
      { header: 'Recruiter Email', key: 'recruiterEmail', width: 30 },
      { header: 'Called At', key: 'calledAt', width: 22 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Remark', key: 'remark', width: 35 },
      { header: 'Next Follow-up', key: 'nextFollowup', width: 22 }
    ],
    cursor: CrmCallLog.aggregate([
      { $match: logDateMatch },
      { $lookup: { from: 'crm_candidates', localField: 'candidateId', foreignField: '_id', as: 'candidate' } },
      { $unwind: '$candidate' },
      { $match: { 'candidate.isActive': true } },
      { $lookup: { from: 'crm_users', localField: 'recruiterId', foreignField: '_id', as: 'recruiter' } },
      { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } },
      { $sort: { calledAt: -1 } },
      {
        $project: {
          _id: 1,
          calledAt: 1,
          status: 1,
          remark: 1,
          nextFollowup: 1,
          candidateName: '$candidate.candidateName',
          mobileNumber: '$candidate.mobileNumber',
          recruiterName: '$recruiter.name',
          recruiterEmail: '$recruiter.email'
        }
      }
    ]).cursor({ batchSize: 500 }),
    autoFilterTo: 'J1',
    tabColor: 'FFFF0000',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        candidateName: doc.candidateName,
        mobileNumber: doc.mobileNumber,
        recruiterName: doc.recruiterName,
        recruiterEmail: doc.recruiterEmail,
        calledAt: formatDate(doc.calledAt),
        status: doc.status,
        remark: doc.remark,
        nextFollowup: formatDate(doc.nextFollowup)
      })
  })

  const [recruiterAgg, statusAgg, classAgg, interestedAgg, monthlyAgg] = await Promise.all([
    CrmCandidate.aggregate([
      { $match: candidateDateMatch },
      {
        $group: {
          _id: '$recruiterId',
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          interested: { $sum: { $cond: [{ $eq: ['$interested.status', 'yes'] }, 1, 0] } },
          sure: { $sum: { $cond: [{ $eq: ['$callStatus', 'sure'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$callStatus', 'pending'] }, 1, 0] } }
        }
      },
      { $lookup: { from: 'crm_users', localField: '_id', foreignField: '_id', as: 'recruiter' } },
      { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } }
    ]),
    CrmCandidate.aggregate([
      { $match: candidateDateMatch },
      { $group: { _id: '$callStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CrmCandidate.aggregate([
      { $match: candidateDateMatch },
      {
        $group: {
          _id: '$candidateClass',
          count: { $sum: 1 },
          interested: { $sum: { $cond: [{ $eq: ['$interested.status', 'yes'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    CrmCandidate.aggregate([
      { $match: candidateDateMatch },
      { $group: { _id: '$interested.status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CrmCandidate.aggregate([
      { $match: candidateDateMatch },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ])
  ])

  addSummaryRows({
    workbook,
    name: 'CRM - Summary',
    columns: [
      { header: 'Type', key: 'type', width: 28 },
      { header: 'Value', key: 'value', width: 28 },
      { header: 'Count', key: 'count', width: 14 },
      { header: 'Interested', key: 'interested', width: 14 },
      { header: 'Sure', key: 'sure', width: 14 },
      { header: 'Percentage', key: 'percentage', width: 14 }
    ],
    autoFilterTo: 'F1',
    rows: [
      sanitizeRow({ type: 'Total', value: 'Employees', count: totalEmployees, interested: '', sure: '', percentage: '' }),
      sanitizeRow({ type: 'Total', value: 'Candidates', count: totalCrm, interested: '', sure: '', percentage: '100%' }),
      sanitizeRow({ type: 'Total', value: 'Call Logs', count: totalCallLogs, interested: '', sure: '', percentage: '' }),
      ...recruiterAgg.map((item) =>
        sanitizeRow({
          type: 'Recruiter',
          value: item.recruiter?.name || idString(item._id) || 'Unknown',
          count: item.total,
          interested: item.interested,
          sure: item.sure,
          percentage: percent(item.sure, item.total)
        })
      ),
      ...statusAgg.map((item) =>
        sanitizeRow({ type: 'Call Status', value: item._id || 'Unknown', count: item.count, interested: '', sure: '', percentage: percent(item.count, totalCrm) })
      ),
      ...classAgg.map((item) =>
        sanitizeRow({ type: 'Candidate Class', value: item._id || 'Unknown', count: item.count, interested: item.interested, sure: '', percentage: percent(item.count, totalCrm) })
      ),
      ...interestedAgg.map((item) =>
        sanitizeRow({ type: 'Interested Status', value: item._id || 'Blank', count: item.count, interested: '', sure: '', percentage: percent(item.count, totalCrm) })
      ),
      ...monthlyAgg.map((item) =>
        sanitizeRow({
          type: 'Monthly CRM Candidates',
          value: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
          count: item.count,
          interested: '',
          sure: '',
          percentage: percent(item.count, totalCrm)
        })
      )
    ]
  })

  return { totalCrm, totalEmployees, totalCallLogs }
}

module.exports = { generateCrmSheet }
