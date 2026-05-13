const { createServer } = require('http')
const request = require('supertest')
const { io: Client } = require('socket.io-client')
const createApp = require('../helpers/createApp')
const { setupSocket } = require('../../socket')

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port))
  })

const connectSocket = (port, token) =>
  new Promise((resolve, reject) => {
    const socket = new Client(`http://localhost:${port}`, { auth: { token } })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })

describe('Socket.io real-time events', () => {
  let app
  let server
  let io
  let port
  let adminToken
  let baToken

  beforeEach(async () => {
    app = createApp()
    server = createServer(app)
    io = setupSocket(server)
    app.set('io', io)
    port = await listen(server)

    await createSuperAdmin({ email: 'admin@test.com' })
    await createBA({ email: 'ba@test.com', advisorCode: 'successba01' })
    adminToken = await getToken(app, 'admin@test.com', 'Admin@123')
    baToken = await getToken(app, 'ba@test.com', 'BA@123')
  })

  afterEach((done) => {
    io.close()
    server.close(done)
  })

  test('admin receives new_student event when BA submits', async () => {
    const adminSocket = await connectSocket(port, adminToken)

    const eventPromise = new Promise((resolve) => {
      adminSocket.on('new_student', resolve)
    })

    await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${baToken}`)
      .send({ candidateName: 'Socket Test', mobileNumber: '9999988888' })

    const data = await eventPromise
    expect(data).toHaveProperty('candidateName', 'Socket Test')
    expect(data).toHaveProperty('submittedBy')

    adminSocket.disconnect()
  })

  test('socket connection with invalid token is rejected', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const badSocket = new Client(`http://localhost:${port}`, { auth: { token: 'invalid-token-xyz' } })
        badSocket.on('connect', () => {
          badSocket.disconnect()
          reject(new Error('Invalid socket connected'))
        })
        badSocket.on('connect_error', (err) => {
          badSocket.disconnect()
          resolve(err)
        })
      })
    ).resolves.toHaveProperty('message', 'Invalid socket token')
  })
})
