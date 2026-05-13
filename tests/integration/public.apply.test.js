const request = require('supertest')
const Student = require('../../models/Student')
const CmsCandidate = require('../../models/cms/CmsCandidate')
const createApp = require('../helpers/createApp')

describe('Public Apply API', () => {
  let app
  let ba

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    ba = await createBA({ email: 'ba@test.com', advisorCode: 'successba01', isActive: true })
  })

  test('GET /api/public/advisor/:code returns advisor display data only', async () => {
    const res = await request(app).get('/api/public/advisor/successba01')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('advisorName')
    expect(res.body).toHaveProperty('advisorCode')
    expect(res.body).not.toHaveProperty('password')
    expect(res.body).not.toHaveProperty('email')
  })

  test('GET returns 404 for unknown or inactive code', async () => {
    const unknown = await request(app).get('/api/public/advisor/badcode99')
    ba.isActive = false
    await ba.save()
    const inactive = await request(app).get('/api/public/advisor/successba01')

    expect(unknown.status).toBe(404)
    expect(inactive.status).toBe(404)
  })

  test('POST /api/public/apply/:code creates student under BA', async () => {
    const res = await request(app)
      .post('/api/public/apply/successba01')
      .send({ candidateName: 'Amit Desai', mobileNumber: '9876543210' })

    expect(res.status).toBe(201)
    const student = await Student.findOne({ candidateName: 'Amit Desai' })
    expect(student.source).toBe('public_form')
    expect(student.submittedBy.toString()).toBe(ba._id.toString())
    expect(student.status).toBe('not_viewed')
  })

  test('POST stores expanded candidate application fields', async () => {
    const res = await request(app)
      .post('/api/public/apply/successba01')
      .send({
        candidateName: 'Expanded Candidate',
        mobileNumber: '9876543211',
        whatsappNo: '9876543212',
        emailId: 'expanded@test.com',
        gender: 'Female',
        currentAge: '24',
        marriageStatus: 'Single',
        aadhaarNo: '123456789012',
        panNo: 'ABCDE1234F',
        currentAddress: 'Current address',
        permanentAddress: 'Permanent address',
        collegeName: 'Success College',
        education: 'B.Com',
        yearOfHigherEducation: '2024',
        computerCourses: 'Tally',
        otherAchievements: 'NSS volunteer',
        professorName: 'Prof Sharma',
        professorContactNumber: '9000000001',
        referenceBy: 'College alumni',
        referenceContactNumber: '9000000002',
        appliedFor: 'Account Executive',
        interestedDepartment: 'Accounts',
        lookingForField: 'Finance',
        preferredIndustry: 'Manufacturing',
        preferredJobLocation: 'Pune',
        currentJobLocation: 'Nashik',
        availabilityForInterview: 'Tomorrow',
        totalExperience: '2',
        experienceDepartment: 'Accounts payable',
        currentCompany: 'Old Company',
        keyResponsibilities: 'Invoice processing',
        currentSalary: '25000',
        expectedSalary: '32000',
        noticePeriod: '1',
        careerSummary: 'Finance professional',
        reasonForJobChange: 'Growth',
        fatherOrHusbandName: 'Mr Patil',
        fatherOccupation: 'Service',
        fatherMobileNumber: '9000000003',
        motherOrWifeName: 'Mrs Patil',
        motherOccupation: 'Homemaker',
        motherMobileNumber: '9000000004',
        siblingName: 'Sibling Patil',
        siblingEducationOccupation: 'Student',
        feedback: 'Good process',
        suggestion: 'Call before interview'
      })

    expect(res.status).toBe(201)

    const student = await Student.findOne({ candidateName: 'Expanded Candidate' })
    expect(student.gender).toBe('Female')
    expect(student.currentAge).toBe(24)
    expect(student.panNo).toBe('ABCDE1234F')
    expect(student.currentAddress).toBe('Current address')
    expect(student.placementReference.referenceBy).toBe('College alumni')
    expect(student.familyDetails.fatherOrHusbandName).toBe('Mr Patil')
    expect(student.feedback).toBe('Good process')

    const cmsCandidate = await CmsCandidate.findOne({ fullName: 'Expanded Candidate' })
    expect(cmsCandidate.lookingForField).toBe('Finance')
    expect(cmsCandidate.keyResponsibilities).toBe('Invoice processing')
    expect(cmsCandidate.suggestion).toBe('Call before interview')
  })

  test('POST requires candidateName and mobileNumber', async () => {
    const res = await request(app).post('/api/public/apply/successba01').send({ candidateName: 'Only Name' })
    expect(res.status).toBe(400)
  })

  test('code lookup is case-insensitive', async () => {
    const res = await request(app)
      .post('/api/public/apply/SUCCESSBA01')
      .send({ candidateName: 'Case Test', mobileNumber: '9999999999' })

    expect(res.status).toBe(201)
  })
})
