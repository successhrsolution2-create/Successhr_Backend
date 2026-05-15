const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('./models/User')
require('dotenv').config()

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI)
  const exists = await User.findOne({ role: 'superAdmin' })

  if (exists) {
    console.log('Super admin already exists')
    process.exit()
  }

  const email = String(process.env.SEED_SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.SEED_SUPER_ADMIN_PASSWORD || '')

  if (!email || !password) {
    throw new Error('Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD before running the seed script')
  }

  if (password.length < 10) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 10 characters')
  }

  const hashed = await bcrypt.hash(password, 10)

  await User.create({
    name: 'Super Admin',
    email,
    password: hashed,
    role: 'superAdmin'
  })

  console.log(`Super admin created: ${email}`)
  process.exit()
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
