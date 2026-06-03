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

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise()
    return mongoose.connection
  }

  const target = getMongoTarget(uri)
  const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  const connectOptions = {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || (isLambda ? 5 : process.env.NODE_ENV === 'production' ? 20 : 10)),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || (isLambda ? 0 : 1)),
    maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_MS || 30000),
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 30000),
    compressors: process.env.MONGO_COMPRESSORS || 'zlib'
  }

  console.log(`MongoDB target: ${target.host}/${target.dbName}`)

  const conn = await mongoose.connect(uri, connectOptions)
  console.log(`MongoDB connected: ${conn.connection.host}`)
  return conn.connection
}

module.exports = connectDB
