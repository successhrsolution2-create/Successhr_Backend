require('dotenv').config()
require('express-async-errors')

const express = require('express')
const http = require('http')
const path = require('path')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const compression = require('compression')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const connectDB = require('./config/db')
const { corsOrigin } = require('./config/corsOptions')
const { setupSocket } = require('./socket')
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const baRoutes = require('./routes/baRoutes')
const candidateRoutes = require('./routes/candidateRoutes')
const studentRoutes = require('./routes/studentRoutes')
const companyRoutes = require('./routes/companyRoutes')
const placementRoutes = require('./routes/placementRoutes')
const cmsRoutes = require('./routes/cms/cmsRoutes')
const publicRoutes = require('./routes/publicRoutes')
const { verifyToken } = require('./middleware/authMiddleware')
const { requireRoleOrManagerAccess } = require('./middleware/roleMiddleware')
const { cleanupTempUploads } = require('./middleware/uploadMiddleware')
const { checkCrmRole, verifyCrmToken } = require('./crm/middleware/crm.auth.middleware')
const { redis } = require('./src/config/redis')

const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const VALID_NODE_ENV = new Set(['development', 'test', 'production'])
const REQUIRED_ENV = ['NODE_ENV', 'MONGODB_URI', 'JWT_SECRET', 'CRM_JWT_SECRET', 'EMS_JWT_SECRET']
const PRODUCTION_SECRET_ENV = [
  'JWT_SECRET',
  'CRM_JWT_SECRET',
  'EMS_JWT_SECRET',
  'EMS_REFRESH_SECRET',
  'COMPANY_ADMIN_JWT_SECRET',
  'BACKUP_JWT_SECRET',
  'BACKUP_DOWNLOAD_SECRET'
]
const PLACEHOLDER_SECRET_PATTERN = /(change_me|replace_with|placeholder|super_secret|secret_key|your_secret|example)/i

const validateEnvironment = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  if (!VALID_NODE_ENV.has(process.env.NODE_ENV)) {
    throw new Error(`NODE_ENV must be one of: ${Array.from(VALID_NODE_ENV).join(', ')}`)
  }

  if (process.env.NODE_ENV === 'production') {
    const weakSecrets = PRODUCTION_SECRET_ENV.filter((key) => {
      const value = String(process.env[key] || '')
      return value.length < 32 || PLACEHOLDER_SECRET_PATTERN.test(value)
    })

    if (weakSecrets.length) {
      throw new Error(`Production secrets are missing, weak, or placeholder values: ${weakSecrets.join(', ')}`)
    }
  }
}

const hasBlockedObjectKey = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 25) return false

  return Object.entries(value).some(([key, item]) => (
    BLOCKED_OBJECT_KEYS.has(key) ||
    String(key).startsWith('$') ||
    hasBlockedObjectKey(item, depth + 1)
  ))
}

const candidateDuplicateMessage = (message) => {
  const match = String(message || '').match(/^A candidate with this (mobile number|email|aadhaar number) already exists$/i)
  if (!match) return null

  const field = match[1].toLowerCase() === 'aadhaar number' ? 'aadhaar' : match[1].toLowerCase()
  return `Candidate already exists with this ${field}`
}

const app = express()
const server = http.createServer(app)
let serverStarted = false
let isShuttingDown = false

validateEnvironment()

const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a moment.' }
})

const createApiLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a moment.' }
  })

const apiLimiter = createApiLimiter()
const crmApiLimiter = createApiLimiter()

const requireCrmAdminAccess = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice('Bearer '.length).trim() : null

  const decodedBearer = bearerToken && bearerToken !== 'cookie' ? jwt.decode(bearerToken) : null
  if (decodedBearer?.type === 'access' && String(decodedBearer?.role || '').startsWith('crm_')) {
    return verifyCrmToken(req, res, () => checkCrmRole(['crm_super_admin'])(req, res, next))
  }

  return verifyToken(req, res, () => requireRoleOrManagerAccess('crmManagement', 'superAdmin')(req, res, next))
}

app.disable('x-powered-by')
app.set(
  'trust proxy',
  process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : process.env.NODE_ENV === 'production' ? 1 : false
)

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false
  })
)

const listen = (port) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      serverStarted = true
      resolve()
    })
  })

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
  )

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  next()
})

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-Requested-With',
    'X-EMS-Refresh-Token',
    'X-Director-Assessment-Approval'
  ],
  optionsSuccessStatus: 204
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(compression())
app.use('/uploads', verifyToken, express.static(path.join(__dirname, 'uploads')))
app.use(express.json({ limit: '2mb' }))
app.use(cleanupTempUploads)
app.use((req, res, next) => {
  if (hasBlockedObjectKey(req.body) || hasBlockedObjectKey(req.query) || hasBlockedObjectKey(req.params)) {
    return res.status(400).json({ message: 'Request contains unsupported object keys' })
  }

  return next()
})
app.use('/api', apiLimiter)
app.use('/crm', crmApiLimiter)
app.get('/health', healthLimiter, (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})
app.get('/api/health', healthLimiter, (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/health/redis', healthLimiter, async (_req, res) => {
  if (!redis) {
    return res.status(500).json({ status: 'error', message: 'Redis not configured' })
  }

  const start = Date.now()
  try {
    await redis.set('ping', 'pong')
    const value = await redis.get('ping')
    if (value !== 'pong') {
      return res.status(500).json({ status: 'error', message: 'Unexpected ping response' })
    }
    return res.json({ status: 'ok', latency: Date.now() - start })
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error?.message || 'Redis error' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/users', userRoutes)
app.use('/api/ba', baRoutes)
app.use('/api/candidates', candidateRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/companies', companyRoutes)
app.use('/api/placements', placementRoutes)
app.use('/api/super-admin', require('./routes/superAdminRoutes'))
app.use('/api/company-management', require('./routes/companyManagementRoutes'))
app.use('/api/company-admin', require('./routes/companyAdminRoutes'))
app.use('/api/cms', verifyToken, requireRoleOrManagerAccess('candidateManagement', 'superAdmin', 'candidateAdmin'), cmsRoutes)
app.use('/api/ems', require('./ems/routes/index'))
app.use('/crm/admin', requireCrmAdminAccess, require('./crm/routes/crm.admin.routes'))
app.use('/crm', require('./crm/crm.routes'))
app.use('/backup', require('./backup/backup.routes'))

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` })
})

app.use((error, _req, res, _next) => {
  const status = error.statusCode || error.status || 500
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const isProduction = process.env.NODE_ENV === 'production'
  const duplicateCandidateMessage = safeStatus === 409 ? candidateDuplicateMessage(error.message) : null

  if (duplicateCandidateMessage) {
    return res.status(409).json({
      success: false,
      message: duplicateCandidateMessage
    })
  }

  if (error.code === 11000) {
    return res.status(409).json({ message: 'Duplicate value already exists' })
  }

  if (error.type === 'entity.parse.failed' || (error instanceof SyntaxError && error.status === 400 && 'body' in error)) {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message })
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID' })
  }

  if (error.message?.includes('Only JPG')) {
    return res.status(400).json({ message: error.message })
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File size must be 10MB or less' })
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: 'Too many files uploaded' })
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ message: 'Unexpected upload field' })
  }

  if (['LIMIT_FIELD_VALUE', 'LIMIT_FIELD_COUNT', 'LIMIT_PART_COUNT'].includes(error.code)) {
    return res.status(400).json({ message: 'Uploaded form is too large' })
  }

  if (safeStatus < 500) {
    return res.status(safeStatus).json({
      message: error.publicMessage || error.message || 'Request failed'
    })
  }

  if (isProduction) {
    console.error(`[server-error] ${error.name || 'Error'}: ${error.message || 'Server error'}`)
  } else {
    console.error(error)
  }

  res.status(safeStatus).json({
    message: error.publicMessage || (isProduction && safeStatus >= 500 ? 'Server error' : error.message || 'Server error')
  })
})

const start = async () => {
  await connectDB()
  const io = setupSocket(server)
  app.set('io', io)

  const envPort = process.env.PORT ? Number(process.env.PORT) : null
  const basePort = Number.isFinite(envPort) ? envPort : 5000
  const allowPortFallback = process.env.NODE_ENV !== 'production' && !Number.isFinite(envPort)
  const maxAttempts = allowPortFallback ? 11 : 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = basePort + attempt
    try {
      await listen(port)
      console.warn(`Server running on port ${port}`)
      if (attempt > 0) {
        console.warn(`PORT not set; fell back from ${basePort} to ${port}`)
      }
      return
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error

      if (attempt >= maxAttempts - 1) {
        const guidance = Number.isFinite(envPort)
          ? `Port ${basePort} is already in use. Set a different PORT in backend/.env or stop the process using it.`
          : `Ports ${basePort}-${basePort + maxAttempts - 1} are already in use. Set PORT in backend/.env or stop the process using one of them.`
        const err = new Error(guidance)
        err.cause = error
        throw err
      }
    }
  }
}

const closeServer = () =>
  new Promise((resolve) => {
    if (!serverStarted) {
      resolve()
      return
    }

    server.close((error) => {
      if (error) console.error(error)
      resolve()
    })
  })

const closeSocket = () =>
  new Promise((resolve) => {
    const io = app.get('io')
    if (!io) {
      resolve()
      return
    }

    io.close(() => resolve())
  })

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.warn(`Received ${signal}; shutting down gracefully`)
  const forcedExit = setTimeout(() => {
    console.error('Graceful shutdown timed out')
    process.exit(1)
  }, 10000)
  forcedExit.unref()

  try {
    await closeSocket()
    await closeServer()
    await mongoose.connection.close(false)
    clearTimeout(forcedExit)
    process.exit(0)
  } catch (error) {
    clearTimeout(forcedExit)
    console.error(error)
    process.exit(1)
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error)
    process.exit(1)
  })

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM')
  })

  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT')
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason)
    process.exit(1)
  })

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
    process.exit(1)
  })
}

module.exports = { app, server, start, validateEnvironment, gracefulShutdown }
