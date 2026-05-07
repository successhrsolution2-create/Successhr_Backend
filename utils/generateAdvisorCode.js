const User = require('../models/User')

async function generateAdvisorCode() {
  const existing = await User.find(
    { advisorCode: { $regex: /^successba\d+$/ } },
    { advisorCode: 1 }
  ).lean()

  if (existing.length === 0) return 'successba01'

  const numbers = existing.map((user) => {
    const match = String(user.advisorCode || '').match(/^successba(\d+)$/)
    return match ? parseInt(match[1], 10) : 0
  })

  const next = Math.max(...numbers) + 1
  return `successba${String(next).padStart(2, '0')}`
}

module.exports = generateAdvisorCode
