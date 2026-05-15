require('dotenv').config()
require('express-async-errors')

const express = require('express')
const http = require('http')
const path = require('path')
const compression = require('compression')
const cors = require('cors')
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
const { requireRole } = require('./middleware/roleMiddleware')
const { redis } = require('./src/config/redis')

const candidateDuplicateMessage = (message) => {
  const match = String(message || '').match(/^A candidate with this (mobile number|email|aadhaar number) already exists$/i)
  if (!match) return null

  const field = match[1].toLowerCase() === 'aadhaar number' ? 'aadhaar' : match[1].toLowerCase()
  return `Candidate already exists with this ${field}`
}

const app = express()
const server = http.createServer(app)

app.disable('x-powered-by')
app.set("trust proxy", 1);

const listen = (port) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      resolve()
    })
  })

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  next()
})

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
)
app.use(compression())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use(express.json({ limit: '2mb' }))
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/health/redis', async (_req, res) => {
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
app.use('/api/cms', verifyToken, requireRole('superAdmin', 'candidateAdmin'), cmsRoutes)

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

  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message })
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ message: error.message || 'Invalid input value' })
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
  const maxAttempts = Number.isFinite(envPort) ? 1 : 11

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = basePort + attempt
    try {
      // eslint-disable-next-line no-await-in-loop
      await listen(port)
      console.log(`Server running on port ${port}`)
      if (attempt > 0) {
        console.log(`PORT not set; fell back from ${basePort} to ${port}`)
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

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
