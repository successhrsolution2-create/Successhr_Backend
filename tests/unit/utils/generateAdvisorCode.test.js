const bcrypt = require('bcryptjs')
const User = require('../../../models/User')
const generateAdvisorCode = require('../../../utils/generateAdvisorCode')

const minBa = async (email, advisorCode) => ({
  name: email.split('@')[0],
  email,
  password: await bcrypt.hash('BA@123', 10),
  role: 'businessAdvisor',
  advisorCode,
  isActive: true
})

describe('generateAdvisorCode', () => {
  test('generates successba01 when no BAs exist', async () => {
    await expect(generateAdvisorCode()).resolves.toBe('successba01')
  })

  test('increments from existing codes', async () => {
    await User.create([
      await minBa('ba1@test.com', 'successba01'),
      await minBa('ba2@test.com', 'successba02')
    ])

    await expect(generateAdvisorCode()).resolves.toBe('successba03')
  })

  test('handles gaps by incrementing from max', async () => {
    await User.create([
      await minBa('ba1@test.com', 'successba01'),
      await minBa('ba5@test.com', 'successba05')
    ])

    await expect(generateAdvisorCode()).resolves.toBe('successba06')
  })

  test('pads single digits and extends beyond 99', async () => {
    expect(await generateAdvisorCode()).toMatch(/^successba\d{2,}$/)
    await User.create(await minBa('ba99@test.com', 'successba99'))
    await expect(generateAdvisorCode()).resolves.toBe('successba100')
  })

  test('concurrent generation should not duplicate codes', async () => {
    const [code1, code2] = await Promise.all([generateAdvisorCode(), generateAdvisorCode()])
    expect(code1).not.toBe(code2)
  })
})
