const request = require('supertest')
const Student = require('../../models/Student')
const createApp = require('../helpers/createApp')

describe('injection and mass-assignment prevention', () => {
  let app
  let adminToken
  let baToken
  let ba
  let otherBA

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    ba = await createBA({ email: 'ba@test.com', advisorCode: 'successba01' })
    otherBA = await createBA({ email: 'other-ba@test.com', advisorCode: 'successba02' })
    adminToken = await getToken(app, 'admin@test.com', 'Admin@123')
    baToken = await getToken(app, 'ba@test.com', 'BA@123')
  })

  test('login rejects NoSQL injection payloads without issuing token', async () => {
    const emailInjection = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'anything' })
    const passwordInjection = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: { $ne: null } })

    expect([400, 401]).toContain(emailInjection.status)
    expect([400, 401]).toContain(passwordInjection.status)
    expect(emailInjection.body).not.toHaveProperty('token')
    expect(passwordInjection.body).not.toHaveProperty('token')
  })

  test('student query injection does not crash the API', async () => {
    const res = await request(app)
      .get('/api/students?name[$regex]=.*&name[$options]=i')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).not.toBe(500)
  })

  test('stored XSS in candidateName should be sanitized before storage', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: '<script>alert(1)</script>', mobileNumber: '9876543210' })

    expect(res.status).toBe(201)
    const student = await Student.findById(res.body._id)
    expect(student.candidateName).not.toContain('<script>')
  })

  test('prototype pollution payload does not affect Object prototype', async () => {
    await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"admin":true},"candidateName":"Test","mobileNumber":"9876543210"}')

    expect({}.admin).toBeUndefined()
  })

  test('BA cannot create a super admin through users endpoint', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ name: 'Hack', email: 'hack@test.com', password: '123456', role: 'superAdmin' })

    expect(res.status).toBe(403)
  })

  test('BA cannot inject submittedBy to claim another BAs student', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Test', mobileNumber: '9876543210', submittedBy: otherBA._id })

    expect(res.status).toBe(201)
    const student = await Student.findById(res.body._id)
    expect(student.submittedBy.toString()).toBe(ba._id.toString())
  })
})
