const { Redis } = require('@upstash/redis')

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

// If Redis isn't configured, export null so the app keeps working without caching.
const redis = url && token ? new Redis({ url, token }) : null

module.exports = { redis }

