const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const User = require('./models/User')
const { isAllowedOrigin } = require('./config/corsOptions')
const { tokenFromSocket } = require('./utils/authCookie')

let io

const setupSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin))
      },
      credentials: true
    }
  })

  io.use(async (socket, next) => {
    try {
      const token = tokenFromSocket(socket)

      if (!token) {
        return next(new Error('Authentication token missing'))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      const user = await User.findById(decoded.id)

      if (!user || !user.isActive) {
        return next(new Error('User is inactive or no longer exists'))
      }

      if (Number(decoded.tokenVersion ?? -1) !== Number(user.tokenVersion || 0)) {
        return next(new Error('Token has been revoked'))
      }

      socket.user = user
      next()
    } catch (error) {
      next(new Error('Invalid socket token'))
    }
  })

  io.on('connection', (socket) => {
    if (socket.user.role === 'superAdmin') {
      socket.join('admin-board')
    }

    if (socket.user.role === 'businessAdvisor') {
      socket.join(`ba-${socket.user._id.toString()}`)
    }
  })

  return io
}

const emitToAdmin = (event, payload) => {
  if (io) {
    io.to('admin-board').emit(event, payload)
  }
}

const emitToBA = (baUserId, event, payload) => {
  if (io && baUserId) {
    io.to(`ba-${baUserId.toString()}`).emit(event, payload)
  }
}

module.exports = { setupSocket, emitToAdmin, emitToBA }
