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

  const hashed = await bcrypt.hash('Admin@123', 10)

  await User.create({
    name: 'Super Admin',
    email: 'admin@consultancy.com',
    password: hashed,
    role: 'superAdmin'
  })

  console.log('Super admin created: admin@consultancy.com / Admin@123')
  process.exit()
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
