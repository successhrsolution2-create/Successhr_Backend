const mongoose = require('mongoose')

const connectDB = async () => {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error('MONGODB_URI is not configured')
  }

  const conn = await mongoose.connect(uri)
  console.log(`MongoDB connected: ${conn.connection.host}`)
}

module.exports = connectDB
