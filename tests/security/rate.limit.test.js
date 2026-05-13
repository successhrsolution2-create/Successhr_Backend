const request = require('supertest')
const createApp = require('../helpers/createApp')

describe('rate limiting', () => {
  let app

  beforeEach(async () => {
    app = createApp()
    await createSuperAdmin({ email: 'admin@test.com' })
    await createBA({ email: 'ba@test.com', advisorCode: 'successba01' })
  })

  test('public advisor code lookup is rate limited after 20 requests/min', async () => {
    const responses = await Promise.all(Array.from({ length: 21 }, () => request(app).get('/api/public/advisor/successba01')))
    const tooMany = responses.filter((res) => res.status === 429)
    expect(tooMany.length).toBeGreaterThan(0)
  })

  test('public form submit is rate limited after 30 successful submissions/hour', async () => {
    const submit = (index) =>
      request(app)
        .post('/api/public/apply/successba01')
        .send({ candidateName: `Rate Test ${index}`, mobileNumber: `98${String(10000000 + index).slice(-8)}` })

    const responses = await Promise.all(Array.from({ length: 31 }, (_value, index) => submit(index)))
    const tooMany = responses.filter((res) => res.status === 429)
    expect(tooMany.length).toBeGreaterThan(0)
  })

  test('rate limit response includes Retry-After header', async () => {
    const responses = await Promise.all(Array.from({ length: 22 }, () => request(app).get('/api/public/advisor/successba01')))
    const limited = responses.find((res) => res.status === 429)

    expect(limited).toBeDefined()
    expect(limited.headers).toHaveProperty('retry-after')
  })
})
