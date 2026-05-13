const jwt = require('jsonwebtoken')
const request = require('supertest')
const createApp = require('../helpers/createApp')

describe('authentication bypass attempts', () => {
  let app
  let baToken
  let ba

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    ba = await createBA({ email: 'ba@test.com', advisorCode: 'successba01' })
    baToken = await getToken(app, 'ba@test.com', 'BA@123')
  })

  test('protected routes return 401 without token', async () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/students' },
      { method: 'get', path: '/api/companies' },
      { method: 'get', path: '/api/placements' },
      { method: 'get', path: '/api/users' },
      { method: 'get', path: '/api/ba/profile' },
      { method: 'get', path: '/api/cms/candidates' }
    ]

    for (const route of protectedRoutes) {
      const res = await request(app)[route.method](route.path)
      expect(res.status).toBe(401)
    }
  })

  test('superAdmin-only routes return 403 for BA token', async () => {
    const adminOnlyRoutes = [
      { method: 'get', path: '/api/users' },
      { method: 'get', path: '/api/cms/candidates' },
      { method: 'get', path: '/api/placements/summary' }
    ]

    for (const route of adminOnlyRoutes) {
      const res = await request(app)[route.method](route.path).set('Authorization', `Bearer ${baToken}`)
      expect(res.status).toBe(403)
    }
  })

  test('tampered JWT payload is rejected', async () => {
    const fakeToken = jwt.sign({ id: ba._id, role: 'superAdmin' }, 'wrong-secret')
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${fakeToken}`)
    expect(res.status).toBe(401)
  })

  test('malformed Authorization values are handled safely', async () => {
    const nullByte = await request(app).get('/api/students').set('Authorization', 'Bearer \x00malicious')
    const sqlStyle = await request(app).get('/api/students').set('Authorization', "Bearer ' OR '1'='1")

    expect(nullByte.status).toBe(401)
    expect(sqlStyle.status).toBe(401)
  })
})
