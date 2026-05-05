const mongoose = require('mongoose')

const getMongoTarget = (uri) => {
  try {
    const parsed = new URL(uri)
    const dbName = (parsed.pathname || '').replace(/^\//, '') || 'test'
    return { host: parsed.hostname, dbName }
  } catch (_error) {
    return { host: 'unknown', dbName: 'unknown' }
  }
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error('MONGODB_URI is not configured')
  }

  const target = getMongoTarget(uri)
  console.log(`MongoDB target: ${target.host}/${target.dbName}`)

  const conn = await mongoose.connect(uri)
  console.log(`MongoDB connected: ${conn.connection.host}`)
}

module.exports = connectDB
