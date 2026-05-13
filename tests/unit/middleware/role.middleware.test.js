const { requireRole } = require('../../../middleware/roleMiddleware')

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn()
})

describe('requireRole middleware', () => {
  test('allows matching role', () => {
    const next = jest.fn()
    requireRole('superAdmin')({ user: { role: 'superAdmin' } }, {}, next)
    expect(next).toHaveBeenCalled()
  })

  test('blocks mismatched role', () => {
    const res = mockRes()
    requireRole('superAdmin')({ user: { role: 'businessAdvisor' } }, res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(403)
  })

  test('allows any listed role', () => {
    const next = jest.fn()
    requireRole('superAdmin', 'businessAdvisor')({ user: { role: 'businessAdvisor' } }, {}, next)
    expect(next).toHaveBeenCalled()
  })
})
