const jwt = require('jsonwebtoken')
const { verifyToken } = require('../../../middleware/authMiddleware')

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn()
})

describe('verifyToken middleware', () => {
  test('passes with valid JWT and active user', async () => {
    const user = await createBA()
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
    const req = { headers: { authorization: `Bearer ${token}` } }
    const next = jest.fn()

    await verifyToken(req, {}, next)

    expect(next).toHaveBeenCalled()
    expect(req.user._id.toString()).toBe(user._id.toString())
  })

  test('rejects with no token', async () => {
    const res = mockRes()
    await verifyToken({ headers: {} }, res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  test('rejects expired token', async () => {
    const user = await createBA()
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s' })
    const res = mockRes()

    await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(401)
  })

  test('rejects malformed or wrong-secret token', async () => {
    const user = await createBA()
    const wrongSecret = jwt.sign({ id: user._id }, 'wrong-secret')

    for (const token of ['not.a.real.token', wrongSecret]) {
      const res = mockRes()
      await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, jest.fn())
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })

  test('rejects inactive user', async () => {
    const user = await createBA({ isActive: false })
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
    const res = mockRes()

    await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(401)
  })
})
