const CmsCandidate = require('../../models/cms/CmsCandidate')
const CmsCompany = require('../../models/cms/CmsCompany')
const CmsInterview = require('../../models/cms/CmsInterview')
const CmsRemark = require('../../models/cms/CmsRemark')
const {
  addSummaryRows,
  addWorksheetFromCursor,
  dateRangeMatch,
  idString,
  joinValues,
  yesNo
} = require('../utils/generatorHelpers')
const { formatDate, sanitizeRow } = require('../utils/sanitizer')

const percent = (count, total) => (total ? `${((Number(count || 0) / total) * 100).toFixed(1)}%` : '0%')

const generateCandidateSheet = async (workbook, fromDate, toDate) => {
  const dateMatch = dateRangeMatch(fromDate, toDate)

  const candidateColumns = [
    { header: 'S.No', key: 'sno', width: 7 },
    { header: 'Candidate ID', key: 'candidateCode', width: 18 },
    { header: 'Record ID', key: 'id', width: 26 },
    { header: 'Full Name', key: 'fullName', width: 25 },
    { header: 'Mobile', key: 'mobileNumber', width: 15 },
    { header: 'WhatsApp', key: 'whatsappNo', width: 15 },
    { header: 'Email', key: 'emailId', width: 28 },
    { header: 'Gender', key: 'gender', width: 12 },
    { header: 'DOB', key: 'dateOfBirth', width: 18 },
    { header: 'Age', key: 'currentAge', width: 8 },
    { header: 'Education', key: 'education', width: 24 },
    { header: 'Specialization', key: 'specialization', width: 22 },
    { header: 'Experience', key: 'totalExperience', width: 12 },
    { header: 'Current Company', key: 'currentCompany', width: 22 },
    { header: 'Current Designation', key: 'currentDesignation', width: 22 },
    { header: 'Applied For', key: 'appliedFor', width: 22 },
    { header: 'Preferred Industry', key: 'preferredIndustry', width: 22 },
    { header: 'Preferred Location', key: 'preferredJobLocation', width: 22 },
    { header: 'Skills', key: 'keySkills', width: 34 },
    { header: 'Source', key: 'source', width: 16 },
    { header: 'Intake Type', key: 'intakeType', width: 16 },
    { header: 'Advisor Code', key: 'advisorCode', width: 16 },
    { header: 'Reference Name', key: 'referenceName', width: 20 },
    { header: 'Candidate Class', key: 'candidateClass', width: 16 },
    { header: 'Registration Status', key: 'candidateRegistrationStatus', width: 20 },
    { header: 'HR Interviewer', key: 'hrInterviewer', width: 20 },
    { header: 'Suitable Industry', key: 'suitableIndustry', width: 22 },
    { header: 'Suitable Department', key: 'suitableDepartment', width: 24 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Updated At', key: 'updatedAt', width: 20 }
  ]

  const { count: totalCandidates } = await addWorksheetFromCursor({
    workbook,
    name: 'Candidate Mgmt - Candidates',
    columns: candidateColumns,
    cursor: CmsCandidate.find(dateMatch).sort({ createdAt: -1 }).lean().cursor(),
    autoFilterTo: 'AD1',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        candidateCode: doc.candidateCode,
        id: idString(doc._id),
        fullName: doc.fullName,
        mobileNumber: doc.mobileNumber,
        whatsappNo: doc.whatsappNo,
        emailId: doc.emailId,
        gender: doc.gender,
        dateOfBirth: formatDate(doc.dateOfBirth),
        currentAge: doc.currentAge,
        education: doc.education,
        specialization: doc.specialization,
        totalExperience: doc.totalExperience,
        currentCompany: doc.currentCompany,
        currentDesignation: doc.currentDesignation,
        appliedFor: doc.appliedFor,
        preferredIndustry: doc.preferredIndustry,
        preferredJobLocation: doc.preferredJobLocation,
        keySkills: joinValues(doc.keySkills),
        source: doc.source,
        intakeType: doc.intakeType,
        advisorCode: doc.advisorCode,
        referenceName: doc.referenceName,
        candidateClass: doc.successInfo?.candidateClass,
        candidateRegistrationStatus: doc.successInfo?.candidateRegistrationStatus,
        hrInterviewer: doc.interviewForm?.hrInterviewer,
        suitableIndustry: doc.interviewForm?.suitableIndustry,
        suitableDepartment: doc.interviewForm?.suitableDepartment,
        createdAt: formatDate(doc.createdAt),
        updatedAt: formatDate(doc.updatedAt)
      })
  })

  const { count: totalCompanies } = await addWorksheetFromCursor({
    workbook,
    name: 'Candidate Mgmt - Companies',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Company ID', key: 'id', width: 26 },
      { header: 'Company Name', key: 'companyName', width: 28 },
      { header: 'Address', key: 'companyAddress', width: 35 },
      { header: 'Contact Person', key: 'contactPersonName', width: 24 },
      { header: 'Designation', key: 'contactPersonDesignation', width: 22 },
      { header: 'Mobile', key: 'mobileNo', width: 15 },
      { header: 'Email', key: 'emailId', width: 28 },
      { header: 'Job Profile', key: 'jobProfile', width: 24 },
      { header: 'Education', key: 'education', width: 22 },
      { header: 'Experience', key: 'experience', width: 16 },
      { header: 'Skills', key: 'requiredKeySkills', width: 34 },
      { header: 'Salary Range', key: 'salaryRange', width: 18 },
      { header: 'Vacancy', key: 'numberOfVacancy', width: 12 },
      { header: 'Job Location', key: 'jobLocation', width: 22 },
      { header: 'Interview Mode', key: 'interviewMode', width: 18 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    cursor: CmsCompany.find(dateMatch).sort({ createdAt: -1 }).lean().cursor(),
    autoFilterTo: 'Q1',
    tabColor: 'FF7030A0',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        companyName: doc.companyName,
        companyAddress: doc.companyAddress,
        contactPersonName: doc.contactPersonName,
        contactPersonDesignation: doc.contactPersonDesignation,
        mobileNo: doc.mobileNo,
        emailId: doc.emailId,
        jobProfile: doc.jobRequirements?.jobProfile,
        education: doc.jobRequirements?.education,
        experience: doc.jobRequirements?.experience,
        requiredKeySkills: joinValues(doc.jobRequirements?.requiredKeySkills),
        salaryRange: doc.jobRequirements?.salaryRange,
        numberOfVacancy: doc.jobRequirements?.numberOfVacancy,
        jobLocation: doc.jobRequirements?.jobLocation,
        interviewMode: doc.aboutCompany?.interviewMode,
        createdAt: formatDate(doc.createdAt)
      })
  })

  const { count: totalInterviews } = await addWorksheetFromCursor({
    workbook,
    name: 'Candidate Mgmt - Interviews',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Interview ID', key: 'id', width: 26 },
      { header: 'Candidate ID', key: 'candidateId', width: 26 },
      { header: 'Candidate Name', key: 'candidateName', width: 25 },
      { header: 'Company Name', key: 'companyName', width: 28 },
      { header: 'Job Role', key: 'jobRole', width: 24 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Attend Interview', key: 'attendInterview', width: 18 },
      { header: 'Interested For Join', key: 'interestedForJoin', width: 20 },
      { header: 'Interview Date', key: 'interviewDate', width: 20 },
      { header: 'Selection Chances', key: 'selectionChances', width: 18 },
      { header: 'Company Rating', key: 'ratingForCompany', width: 16 },
      { header: 'Result', key: 'result', width: 16 },
      { header: 'Remark', key: 'remark', width: 35 },
      { header: 'Updated By', key: 'updatedBy', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    cursor: CmsInterview.aggregate([
      { $match: dateMatch },
      { $lookup: { from: 'cms_candidates', localField: 'candidateId', foreignField: '_id', as: 'candidate' } },
      { $match: { candidate: { $ne: [] } } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          candidateId: 1,
          candidateName: 1,
          companyName: 1,
          jobRole: 1,
          reference: 1,
          attendInterview: 1,
          interestedForJoin: 1,
          interviewDate: 1,
          selectionChances: 1,
          ratingForCompany: 1,
          result: 1,
          remark: 1,
          updatedBy: 1,
          createdAt: 1
        }
      }
    ]).cursor({ batchSize: 500 }),
    autoFilterTo: 'P1',
    tabColor: 'FFFFC000',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        candidateId: idString(doc.candidateId),
        candidateName: doc.candidateName,
        companyName: doc.companyName,
        jobRole: doc.jobRole,
        reference: doc.reference,
        attendInterview: doc.attendInterview,
        interestedForJoin: doc.interestedForJoin,
        interviewDate: formatDate(doc.interviewDate),
        selectionChances: doc.selectionChances,
        ratingForCompany: doc.ratingForCompany,
        result: doc.result,
        remark: doc.remark,
        updatedBy: doc.updatedBy,
        createdAt: formatDate(doc.createdAt)
      })
  })

  const [sourceAgg, classAgg, monthlyAgg, remarkCount] = await Promise.all([
    CmsCandidate.aggregate([
      { $match: dateMatch },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CmsCandidate.aggregate([
      { $match: dateMatch },
      { $group: { _id: '$successInfo.candidateClass', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CmsCandidate.aggregate([
      { $match: dateMatch },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]),
    CmsRemark.aggregate([
      { $lookup: { from: 'cms_candidates', localField: 'candidateId', foreignField: '_id', as: 'candidate' } },
      { $match: { candidate: { $ne: [] } } },
      { $count: 'count' }
    ]).then(([row]) => row?.count || 0)
  ])

  addSummaryRows({
    workbook,
    name: 'Candidate Mgmt - Summary',
    columns: [
      { header: 'Type', key: 'type', width: 26 },
      { header: 'Value', key: 'value', width: 26 },
      { header: 'Count', key: 'count', width: 14 },
      { header: 'Percentage', key: 'percentage', width: 14 }
    ],
    autoFilterTo: 'D1',
    rows: [
      sanitizeRow({ type: 'Total', value: 'Candidates', count: totalCandidates, percentage: '100%' }),
      sanitizeRow({ type: 'Total', value: 'Companies', count: totalCompanies, percentage: '' }),
      sanitizeRow({ type: 'Total', value: 'Interviews', count: totalInterviews, percentage: '' }),
      sanitizeRow({ type: 'Total', value: 'Success Remark Records', count: remarkCount, percentage: '' }),
      ...sourceAgg.map((item) =>
        sanitizeRow({ type: 'Source', value: item._id || 'Unknown', count: item.count, percentage: percent(item.count, totalCandidates) })
      ),
      ...classAgg.map((item) =>
        sanitizeRow({ type: 'Candidate Class', value: item._id || 'Blank', count: item.count, percentage: percent(item.count, totalCandidates) })
      ),
      ...monthlyAgg.map((item) =>
        sanitizeRow({
          type: 'Monthly Candidate Registrations',
          value: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
          count: item.count,
          percentage: percent(item.count, totalCandidates)
        })
      )
    ]
  })

  return { totalCandidates, totalCompanies, totalInterviews }
}

module.exports = { generateCandidateSheet }
