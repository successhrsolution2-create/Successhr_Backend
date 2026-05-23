const BusinessAdvisor = require('../../models/BusinessAdvisor')
const Candidate = require('../../models/Candidate')
const Company = require('../../models/Company')
const Placement = require('../../models/Placement')
const User = require('../../models/User')
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

const livePlacementStages = () => [
  { $lookup: { from: 'candidates', localField: 'candidateId', foreignField: '_id', as: 'candidate' } },
  { $unwind: '$candidate' },
  { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'company' } },
  { $unwind: '$company' }
]

const generateBusinessAdvisorSheet = async (workbook, fromDate, toDate) => {
  const dateMatch = dateRangeMatch(fromDate, toDate)
  const advisorUserMatch = { role: 'businessAdvisor', ...dateMatch }

  const { count: totalAdvisors } = await addWorksheetFromCursor({
    workbook,
    name: 'BA - Advisors',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'User ID', key: 'userId', width: 26 },
      { header: 'Advisor Code', key: 'advisorCode', width: 18 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Active', key: 'isActive', width: 10 },
      { header: 'Profile Complete', key: 'isProfileComplete', width: 18 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'City', key: 'city', width: 18 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Bank Name', key: 'bankName', width: 24 },
      { header: 'Account Type', key: 'accountType', width: 16 },
      { header: 'Aadhaar Provided', key: 'aadhaarProvided', width: 18 },
      { header: 'PAN Provided', key: 'panProvided', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ],
    cursor: BusinessAdvisor.find(dateMatch)
      .populate('userId', 'name email advisorCode isActive createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .cursor(),
    autoFilterTo: 'P1',
    tabColor: 'FF00B050',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        userId: idString(doc.userId),
        advisorCode: doc.userId?.advisorCode,
        name: doc.fullName || doc.userId?.name,
        email: doc.email || doc.userId?.email,
        isActive: yesNo(doc.userId?.isActive),
        isProfileComplete: yesNo(doc.isProfileComplete),
        phone: doc.phone,
        city: doc.city,
        address: doc.address,
        bankName: doc.bankDetails?.bankName,
        accountType: doc.bankDetails?.accountType,
        aadhaarProvided: yesNo(doc.documents?.aadharCard?.number || doc.documents?.aadharCard?.fileUrl),
        panProvided: yesNo(doc.documents?.panCard?.number || doc.documents?.panCard?.fileUrl),
        createdAt: formatDate(doc.createdAt),
        updatedAt: formatDate(doc.updatedAt)
      })
  })

  const { count: totalCandidates } = await addWorksheetFromCursor({
    workbook,
    name: 'BA - Candidates',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Candidate ID', key: 'id', width: 26 },
      { header: 'Candidate Name', key: 'candidateName', width: 25 },
      { header: 'Mobile', key: 'mobileNumber', width: 15 },
      { header: 'Email', key: 'emailId', width: 28 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Education', key: 'education', width: 24 },
      { header: 'Applied For', key: 'appliedFor', width: 22 },
      { header: 'Preferred Industry', key: 'preferredIndustry', width: 22 },
      { header: 'Preferred Location', key: 'preferredJobLocation', width: 22 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Selection Status', key: 'selectionStatus', width: 18 },
      { header: 'Advisor Name', key: 'advisorName', width: 24 },
      { header: 'Advisor Email', key: 'advisorEmail', width: 28 },
      { header: 'Commission Salary', key: 'commissionSalary', width: 18 },
      { header: 'Commission %', key: 'commissionPercentage', width: 16 },
      { header: 'Commission Amount', key: 'commissionAmount', width: 18 },
      { header: 'Payment Status', key: 'paymentStatus', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    cursor: Candidate.find(dateMatch)
      .populate('submittedBy', 'name email advisorCode')
      .sort({ createdAt: -1 })
      .lean()
      .cursor(),
    autoFilterTo: 'S1',
    tabColor: 'FF0070C0',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        candidateName: doc.candidateName,
        mobileNumber: doc.mobileNumber,
        emailId: doc.emailId,
        gender: doc.gender,
        education: doc.education,
        appliedFor: doc.appliedFor,
        preferredIndustry: doc.preferredIndustry,
        preferredJobLocation: doc.preferredJobLocation,
        status: doc.status,
        selectionStatus: doc.selectionStatus,
        advisorName: doc.submittedBy?.name,
        advisorEmail: doc.submittedBy?.email,
        commissionSalary: doc.advisorCommission?.salary,
        commissionPercentage: doc.advisorCommission?.percentage,
        commissionAmount: doc.advisorCommission?.amount,
        paymentStatus: doc.advisorCommission?.paymentStatus,
        createdAt: formatDate(doc.createdAt)
      })
  })

  const { count: totalCompanies } = await addWorksheetFromCursor({
    workbook,
    name: 'BA - Companies',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Company ID', key: 'id', width: 26 },
      { header: 'Company Name', key: 'companyName', width: 28 },
      { header: 'Contact Person', key: 'contactPersonName', width: 24 },
      { header: 'Mobile', key: 'mobileNo', width: 15 },
      { header: 'Email', key: 'emailId', width: 28 },
      { header: 'Job Profile', key: 'jobProfile', width: 24 },
      { header: 'Education', key: 'education', width: 22 },
      { header: 'Skills', key: 'requiredKeySkills', width: 34 },
      { header: 'Salary Range', key: 'salaryRange', width: 18 },
      { header: 'Vacancy', key: 'numberOfVacancy', width: 12 },
      { header: 'Job Location', key: 'jobLocation', width: 22 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Advisor Name', key: 'advisorName', width: 24 },
      { header: 'Advisor Email', key: 'advisorEmail', width: 28 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    cursor: Company.find(dateMatch)
      .populate('submittedBy', 'name email advisorCode')
      .sort({ createdAt: -1 })
      .lean()
      .cursor(),
    autoFilterTo: 'P1',
    tabColor: 'FF7030A0',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        companyName: doc.companyName,
        contactPersonName: doc.contactPersonName,
        mobileNo: doc.mobileNo,
        emailId: doc.emailId,
        jobProfile: doc.jobRequirements?.jobProfile,
        education: doc.jobRequirements?.education,
        requiredKeySkills: joinValues(doc.jobRequirements?.requiredKeySkills),
        salaryRange: doc.jobRequirements?.salaryRange,
        numberOfVacancy: doc.jobRequirements?.numberOfVacancy,
        jobLocation: doc.jobRequirements?.jobLocation,
        status: doc.status,
        advisorName: doc.submittedBy?.name,
        advisorEmail: doc.submittedBy?.email,
        createdAt: formatDate(doc.createdAt)
      })
  })

  const { count: totalPlacements } = await addWorksheetFromCursor({
    workbook,
    name: 'BA - Placements',
    columns: [
      { header: 'S.No', key: 'sno', width: 7 },
      { header: 'Placement ID', key: 'id', width: 26 },
      { header: 'Candidate', key: 'candidateName', width: 25 },
      { header: 'Company', key: 'companyName', width: 28 },
      { header: 'Advisor', key: 'advisorName', width: 24 },
      { header: 'Job Profile', key: 'jobProfile', width: 24 },
      { header: 'Salary PM', key: 'offeredSalaryPM', width: 14 },
      { header: 'Joining Date', key: 'joiningDate', width: 20 },
      { header: 'Selection Status', key: 'selectionStatus', width: 18 },
      { header: 'Process Stage', key: 'processStage', width: 24 },
      { header: 'Earning %', key: 'earningPercent', width: 12 },
      { header: 'Salary Basis', key: 'salaryBasis', width: 14 },
      { header: 'Earning Amount', key: 'earningAmount', width: 18 },
      { header: 'Earning Status', key: 'earningStatus', width: 16 },
      { header: 'Paid Date', key: 'earningPaidDate', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    cursor: Placement.aggregate([
      { $match: dateMatch },
      ...livePlacementStages(),
      { $lookup: { from: 'users', localField: 'baId', foreignField: '_id', as: 'advisor' } },
      { $unwind: { path: '$advisor', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          jobProfile: 1,
          offeredSalaryPM: 1,
          joiningDate: 1,
          selectionStatus: 1,
          processStage: 1,
          earningPercent: 1,
          salaryBasis: 1,
          earningAmount: 1,
          earningStatus: 1,
          earningPaidDate: 1,
          createdAt: 1,
          candidateName: '$candidate.candidateName',
          companyName: '$company.companyName',
          advisorName: '$advisor.name'
        }
      }
    ]).cursor({ batchSize: 500 }),
    autoFilterTo: 'P1',
    tabColor: 'FFFFC000',
    mapRow: (doc, index) =>
      sanitizeRow({
        sno: index,
        id: idString(doc._id),
        candidateName: doc.candidateName,
        companyName: doc.companyName,
        advisorName: doc.advisorName,
        jobProfile: doc.jobProfile,
        offeredSalaryPM: doc.offeredSalaryPM,
        joiningDate: formatDate(doc.joiningDate),
        selectionStatus: doc.selectionStatus,
        processStage: doc.processStage,
        earningPercent: doc.earningPercent,
        salaryBasis: doc.salaryBasis,
        earningAmount: doc.earningAmount,
        earningStatus: doc.earningStatus,
        earningPaidDate: formatDate(doc.earningPaidDate),
        createdAt: formatDate(doc.createdAt)
      })
  })

  const [advisorStatusAgg, candidateStatusAgg, earningsAgg, monthlyAgg] = await Promise.all([
    User.aggregate([
      { $match: advisorUserMatch },
      { $group: { _id: '$isActive', count: { $sum: 1 } } }
    ]),
    Candidate.aggregate([
      { $match: dateMatch },
      { $group: { _id: '$selectionStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Placement.aggregate([
      { $match: dateMatch },
      ...livePlacementStages(),
      {
        $group: {
          _id: '$earningStatus',
          count: { $sum: 1 },
          totalEarning: { $sum: '$earningAmount' }
        }
      },
      { $sort: { totalEarning: -1 } }
    ]),
    User.aggregate([
      { $match: advisorUserMatch },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ])
  ])

  addSummaryRows({
    workbook,
    name: 'BA - Summary',
    columns: [
      { header: 'Type', key: 'type', width: 28 },
      { header: 'Value', key: 'value', width: 26 },
      { header: 'Count', key: 'count', width: 14 },
      { header: 'Amount', key: 'amount', width: 18 },
      { header: 'Percentage', key: 'percentage', width: 14 }
    ],
    autoFilterTo: 'E1',
    rows: [
      sanitizeRow({ type: 'Total', value: 'Advisors', count: totalAdvisors, amount: '', percentage: '100%' }),
      sanitizeRow({ type: 'Total', value: 'Candidates', count: totalCandidates, amount: '', percentage: '' }),
      sanitizeRow({ type: 'Total', value: 'Companies', count: totalCompanies, amount: '', percentage: '' }),
      sanitizeRow({ type: 'Total', value: 'Placements', count: totalPlacements, amount: '', percentage: '' }),
      ...advisorStatusAgg.map((item) =>
        sanitizeRow({
          type: 'Advisor Status',
          value: item._id ? 'Active' : 'Inactive',
          count: item.count,
          amount: '',
          percentage: percent(item.count, totalAdvisors)
        })
      ),
      ...candidateStatusAgg.map((item) =>
        sanitizeRow({
          type: 'Candidate Selection Status',
          value: item._id || 'Blank',
          count: item.count,
          amount: '',
          percentage: percent(item.count, totalCandidates)
        })
      ),
      ...earningsAgg.map((item) =>
        sanitizeRow({
          type: 'Earning Status',
          value: item._id || 'Blank',
          count: item.count,
          amount: item.totalEarning || 0,
          percentage: percent(item.count, totalPlacements)
        })
      ),
      ...monthlyAgg.map((item) =>
        sanitizeRow({
          type: 'Monthly New Advisors',
          value: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
          count: item.count,
          amount: '',
          percentage: percent(item.count, totalAdvisors)
        })
      )
    ]
  })

  return { totalAdvisors, totalCandidates, totalCompanies, totalPlacements }
}

module.exports = { generateBusinessAdvisorSheet }
