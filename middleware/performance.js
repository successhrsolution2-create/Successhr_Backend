const compression = require('compression')
const helmet = require('helmet')

module.exports = (app) => {
  app.use(compression({ level: 6, threshold: 1024 }))

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  )

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
}
