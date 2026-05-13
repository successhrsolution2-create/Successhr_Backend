const request = require('supertest')
const Student = require('../../models/Student')
const Placement = require('../../models/Placement')
const CmsCandidate = require('../../models/cms/CmsCandidate')
const createApp = require('../helpers/createApp')

describe('Student API', () => {
  let app
  let adminToken
  let baToken
  let otherBAToken
  let ba
  let otherBA

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    ba = await createBA({ email: 'ba1@test.com', advisorCode: 'successba01' })
    otherBA = await createBA({ email: 'ba2@test.com', advisorCode: 'successba02' })
    adminToken = await getToken(app, 'admin@test.com', 'Admin@123')
    baToken = await getToken(app, 'ba1@test.com', 'BA@123')
    otherBAToken = await getToken(app, 'ba2@test.com', 'BA@123')
  })

  test('BA can create a student linked to self', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Rahul', mobileNumber: '9876543210' })

    expect(res.status).toBe(201)
    expect(res.body.submittedBy._id).toBe(ba._id.toString())
    expect(res.body.status).toBe('not_viewed')
  })

  test('BA can submit an unlinked candidate management record into dashboard flow', async () => {
    const existingCms = await CmsCandidate.create({
      candidateCode: 'C26050001',
      fullName: 'Existing Candidate',
      mobileNumber: '9876543210',
      emailId: 'exists@example.com',
      source: 'public_form',
      intakeType: 'walkin',
      createdBy: ba._id
    })

    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Claimed Candidate', mobileNumber: '9876543210', emailId: 'exists@example.com' })

    expect(res.status).toBe(201)
    expect(res.body.submittedBy._id).toBe(ba._id.toString())

    const cmsRecords = await CmsCandidate.find({})
    expect(cmsRecords).toHaveLength(1)

    const linkedCms = await CmsCandidate.findById(existingCms._id)
    expect(linkedCms.sourceCandidateId.toString()).toBe(res.body._id)
    expect(linkedCms.advisor.toString()).toBe(ba._id.toString())
    expect(linkedCms.intakeType).toBe('advisor')
    expect(linkedCms.source).toBe('public_form')
    expect(linkedCms.fullName).toBe('Claimed Candidate')

    const adminRes = await request(app).get('/api/students').set('Authorization', `Bearer ${adminToken}`)
    const baRes = await request(app).get('/api/students').set('Authorization', `Bearer ${baToken}`)

    expect(adminRes.body).toHaveLength(1)
    expect(baRes.body).toHaveLength(1)
  })

  test('BA cannot create student with an existing dashboard duplicate mobile', async () => {
    await createStudentForBA(otherBA._id, { mobileNumber: '9876543210' })

    const duplicateMobile = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Mobile Duplicate', mobileNumber: '9876543210' })

    expect(duplicateMobile.status).toBe(409)
    expect(duplicateMobile.body.message).toMatch(/mobile number already exists/i)
  })

  test('unauthenticated user cannot create student', async () => {
    const res = await request(app)
      .post('/api/students')
      .send({ candidateName: 'Rahul', mobileNumber: '9876543210' })

    expect(res.status).toBe(401)
  })

  test('superAdmin sees all students and BA sees only own students', async () => {
    await createStudentForBA(ba._id)
    await createStudentForBA(otherBA._id)

    const adminRes = await request(app).get('/api/students').set('Authorization', `Bearer ${adminToken}`)
    const baRes = await request(app).get('/api/students').set('Authorization', `Bearer ${baToken}`)

    expect(adminRes.body).toHaveLength(2)
    expect(baRes.body).toHaveLength(1)
    expect(baRes.body[0].submittedBy._id).toBe(ba._id.toString())
  })

  test('BA cannot fetch or update another BAs student', async () => {
    const other = await createStudentForBA(otherBA._id)

    const getRes = await request(app)
      .get(`/api/students/${other._id}`)
      .set('Authorization', `Bearer ${baToken}`)
    const putRes = await request(app)
      .put(`/api/students/${other._id}`)
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Hack' })

    expect(getRes.status).toBe(403)
    expect(putRes.status).toBe(403)
  })

  test('BA can update own student while protected fields are blocked', async () => {
    const student = await createStudentForBA(ba._id)

    const ok = await request(app)
      .put(`/api/students/${student._id}`)
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Updated Name', mobileNumber: student.mobileNumber })
    const blocked = await request(app)
      .put(`/api/students/${student._id}`)
      .set('Authorization', `Bearer ${baToken}`)
      .send({ submittedBy: otherBA._id })

    expect(ok.status).toBe(200)
    expect(ok.body.candidateName).toBe('Updated Name')
    expect(blocked.status).toBe(400)
  })

  test('superAdmin can delete student and linked placement', async () => {
    const student = await createStudentForBA(ba._id)
    const company = await createCompanyForBA(ba._id)
    await Placement.create({ candidateId: student._id, companyId: company._id, baId: ba._id })

    const res = await request(app)
      .delete(`/api/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    await expect(Student.findById(student._id)).resolves.toBeNull()
    await expect(Placement.findOne({ candidateId: student._id })).resolves.toBeNull()
  })

  test('BA cannot delete students and cannot change reference board status', async () => {
    const student = await createStudentForBA(ba._id)

    const delRes = await request(app)
      .delete(`/api/students/${student._id}`)
      .set('Authorization', `Bearer ${baToken}`)
    const statusRes = await request(app)
      .patch(`/api/students/${student._id}/status`)
      .set('Authorization', `Bearer ${baToken}`)
      .send({ status: 'priority' })

    expect(delRes.status).toBe(403)
    expect(statusRes.status).toBe(403)
  })

  test('status update accepts valid values only', async () => {
    const student = await createStudentForBA(ba._id)

    const res = await request(app)
      .patch(`/api/students/${student._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid_status' })

    expect(res.status).toBe(400)
  })

  test('another BA token exists for isolation setup', () => {
    expect(otherBAToken).toEqual(expect.any(String))
  })
})
