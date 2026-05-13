require('express-async-errors')

const express = require('express')
const compression = require('compression')
const cors = require('cors')
const authRoutes = require('../../routes/authRoutes')
const userRoutes = require('../../routes/userRoutes')
const baRoutes = require('../../routes/baRoutes')
const candidateRoutes = require('../../routes/candidateRoutes')
const studentRoutes = require('../../routes/studentRoutes')
const companyRoutes = require('../../routes/companyRoutes')
const placementRoutes = require('../../routes/placementRoutes')
const cmsRoutes = require('../../routes/cms/cmsRoutes')
const publicRoutes = require('../../routes/publicRoutes')
const { verifyToken } = require('../../middleware/authMiddleware')
const { requireRole } = require('../../middleware/roleMiddleware')

const createApp = () => {
  const app = express()

  app.use(cors({ origin: true, credentials: true }))
  app.use(compression())
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
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

    return res.status(status).json({ message: error.publicMessage || error.message || 'Server error' })
  })

  return app
}

module.exports = createApp
