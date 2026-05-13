const request = require('supertest')
const createApp = require('../helpers/createApp')

describe('Auth API', () => {
  let app

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
  })

  test('POST /api/auth/login returns token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@123' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('superAdmin')
    expect(res.body.user).not.toHaveProperty('password')
  })

  test('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body).not.toHaveProperty('token')
  })

  test('does not reveal whether email exists', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'Admin@123' })

    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/invalid/i)
  })

  test('returns 401 for inactive BA account', async () => {
    await createBA({ email: 'ba@test.com', advisorCode: 'successba01', isActive: false })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ba@test.com', password: 'BA@123' })

    expect(res.status).toBe(401)
  })

  test('does not allow login with empty fields', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})
