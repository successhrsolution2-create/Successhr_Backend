require('dotenv').config()
require('express-async-errors')

const express = require('express')
const http = require('http')
const cors = require('cors')
const connectDB = require('./config/db')
const { corsOrigin } = require('./config/corsOptions')
const { setupSocket } = require('./socket')
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const baRoutes = require('./routes/baRoutes')
const studentRoutes = require('./routes/studentRoutes')
const companyRoutes = require('./routes/companyRoutes')
const placementRoutes = require('./routes/placementRoutes')

const app = express()
const server = http.createServer(app)

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
)
app.use(express.json({ limit: '2mb' }))
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/ba', baRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/companies', companyRoutes)
app.use('/api/placements', placementRoutes)

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
    return res.status(400).json({ message: 'File size must be 5MB or less' })
  }

  console.error(error)
  res.status(status).json({ message: error.message || 'Server error' })
})

const start = async () => {
  await connectDB()
  setupSocket(server)

  const port = process.env.PORT || 5000
  server.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
