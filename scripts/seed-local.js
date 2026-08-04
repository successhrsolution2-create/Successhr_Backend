require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('../models/User')

const seedLocal = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/successhr')
    console.log('Connected to MongoDB')

    const existingAdmin = await User.findOne({ role: 'superAdmin' })
    if (existingAdmin) {
      console.log('Super Admin already exists:', existingAdmin.email)
    } else {
      const hashedPassword = await bcrypt.hash('admin123', 12)
      const admin = new User({
        name: 'Local Admin',
        email: 'admin@successhr.com',
        password: hashedPassword,
        role: 'superAdmin',
        isActive: true
      })
      await admin.save()
      console.log('Created superAdmin: admin@successhr.com / admin123')
    }

    process.exit(0)
  } catch (error) {
    console.error('Seed error:', error)
    process.exit(1)
  }
}

seedLocal()
