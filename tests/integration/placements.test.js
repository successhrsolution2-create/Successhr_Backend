const request = require('supertest')
const Student = require('../../models/Student')
const createApp = require('../helpers/createApp')

describe('Placement API', () => {
  let app
  let adminToken
  let baToken
  let ba
  let otherBA
  let student
  let company

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    ba = await createBA({ email: 'ba@test.com', advisorCode: 'successba01' })
    otherBA = await createBA({ email: 'other-ba@test.com', advisorCode: 'successba02' })
    adminToken = await getToken(app, 'admin@test.com', 'Admin@123')
    baToken = await getToken(app, 'ba@test.com', 'BA@123')
    student = await createStudentForBA(ba._id)
    company = await createCompanyForBA(ba._id)
  })

  const validPlacement = () => ({
    studentId: student._id,
    companyId: company._id,
    jobProfile: 'Sales',
    offeredSalaryPM: 25000,
    salaryBasis: 1,
    earningPercent: 8.33,
    selectionStatus: 'selected'
  })

  test('creates placement with server-calculated earningAmount', async () => {
    const res = await request(app)
      .post('/api/placements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validPlacement(), earningAmount: 999999 })

    expect(res.status).toBe(201)
    expect(res.body.earningAmount).toBe(2083)
    expect(res.body.earningStatus).toBe('pending')
  })

  test('syncs student selectionStatus after placement', async () => {
    await request(app)
      .post('/api/placements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validPlacement(), selectionStatus: 'joined' })

    const updated = await Student.findById(student._id)
    expect(updated.selectionStatus).toBe('joined')
  })

  test('BA can only GET own placements via /my', async () => {
    await createPlacementForBA(ba._id)
    await createPlacementForBA(otherBA._id)

    const res = await request(app).get('/api/placements/my').set('Authorization', `Bearer ${baToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).not.toHaveProperty('adminNotes')
  })

  test('marking paid sets earningPaidDate and BA cannot mark paid', async () => {
    const placement = await createPlacementForBA(ba._id)

    const baRes = await request(app)
      .patch(`/api/placements/${placement._id}/pay`)
      .set('Authorization', `Bearer ${baToken}`)
      .send({ earningStatus: 'paid' })
    const adminRes = await request(app)
      .patch(`/api/placements/${placement._id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ earningStatus: 'paid' })

    expect(baRes.status).toBe(403)
    expect(adminRes.status).toBe(200)
    expect(adminRes.body.earningStatus).toBe('paid')
    expect(adminRes.body.earningPaidDate).toBeDefined()
  })

  test('duplicate placement for same student returns 409', async () => {
    await request(app).post('/api/placements').set('Authorization', `Bearer ${adminToken}`).send(validPlacement())

    const res = await request(app)
      .post('/api/placements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validPlacement())

    expect(res.status).toBe(409)
  })
})
