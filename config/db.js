const mongoose = require('mongoose')
const dns = require('dns')

const getMongoTarget = (uri) => {
  try {
    const parsed = new URL(uri)
    const dbName = (parsed.pathname || '').replace(/^\//, '') || 'test'
    return { host: parsed.hostname, dbName }
  } catch (_error) {
    return { host: 'unknown', dbName: 'unknown' }
  }
}

const withDefaultMongoPort = (host) => {
  const trimmed = String(host || '').trim()
  if (!trimmed || trimmed.includes(':')) return trimmed
  return `${trimmed}:27017`
}

const configureMongoDns = () => {
  const servers = String(process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean)

  if (!servers.length) return null

  try {
    dns.setServers(servers)
  } catch (error) {
    throw new Error(`Invalid MONGODB_DNS_SERVERS value. ${error.message}`, { cause: error })
  }

  return servers
}

const buildSrvFallbackUri = (uri) => {
  const hosts = String(process.env.MONGODB_SRV_FALLBACK_HOSTS || '')
    .split(',')
    .map(withDefaultMongoPort)
    .filter(Boolean)
    .join(',')

  if (!hosts) return null

  const parsed = new URL(uri)
  if (parsed.protocol !== 'mongodb+srv:') return null

  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
    : ''
  const params = new URLSearchParams(parsed.search)
  const fallbackParams = new URLSearchParams(process.env.MONGODB_SRV_FALLBACK_OPTIONS || '')

  fallbackParams.forEach((value, key) => {
    params.set(key, value)
  })

  if (!params.has('tls') && !params.has('ssl')) {
    params.set('tls', 'true')
  }

  return `mongodb://${auth}${hosts}${parsed.pathname}?${params.toString()}`
}

const connectionHint = (error) => {
  const message = error?.message || 'Unknown MongoDB connection error'
  if (/Could not connect to any servers in your MongoDB Atlas cluster/i.test(message)) {
    return `${message} Check Atlas Network Access for your current IP and confirm outbound TCP 27017 is allowed.`
  }
  return message
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

  const configuredDnsServers = configureMongoDns()
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
  if (configuredDnsServers) {
    console.log(`MongoDB DNS servers: ${configuredDnsServers.join(', ')}`)
  }

  let conn
  try {
    conn = await mongoose.connect(uri, connectOptions)
  } catch (error) {
    if (error?.syscall !== 'querySrv') {
      throw error
    }

    const dnsServers = dns.getServers().join(', ') || 'none'
    const fallbackUri = buildSrvFallbackUri(uri)
    if (!fallbackUri) {
      throw new Error(
        `MongoDB SRV DNS lookup failed for ${target.host}. Node DNS servers: ${dnsServers}. ` +
          'Fix local DNS/SRV resolution or configure MONGODB_SRV_FALLBACK_HOSTS with the Atlas standard seedlist hosts.',
        { cause: error }
      )
    }

    console.warn(
      `MongoDB SRV DNS lookup failed for ${target.host}; Node DNS servers: ${dnsServers}. Trying configured standard seedlist fallback.`
    )

    try {
      conn = await mongoose.connect(fallbackUri, connectOptions)
    } catch (fallbackError) {
      throw new Error(`MongoDB standard seedlist fallback failed. ${connectionHint(fallbackError)}`, {
        cause: fallbackError
      })
    }
  }

  console.log(`MongoDB connected: ${conn.connection.host}`)
  return conn.connection
}

module.exports = connectDB
