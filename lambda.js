require('dotenv').config()

const serverless = require('serverless-http')
const { loadParameterStoreEnv } = require('./config/awsParameters')
const connectDB = require('./config/db')

let cachedHandler
let cachedApp

const getHandler = async () => {
  await loadParameterStoreEnv()
  await connectDB()

  if (!cachedApp) {
    cachedApp = require('./server').app
  }

  if (!cachedHandler) {
    cachedHandler = serverless(cachedApp)
  }

  return cachedHandler
}

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false
  const handler = await getHandler()
  return handler(event, context)
}
