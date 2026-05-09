const { redis } = require('../config/redis')

const buildCacheKey = (req) => `${req.method}:${req.originalUrl}`

const cache = (ttlSeconds = 60) => async (req, res, next) => {
  if (req.method !== 'GET') return next()
  if (!redis) return next()

  const key = buildCacheKey(req)

  try {
    const hit = await redis.get(key)
    if (hit) {
      return res.json(typeof hit === 'string' ? JSON.parse(hit) : hit)
    }
  } catch (_e) {
    // Cache errors must never break the request.
  }

  const originalJson = res.json.bind(res)
  res.json = async (body) => {
    try {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await redis.set(key, JSON.stringify(body), { ex: ttlSeconds })
      }
    } catch (_e) {
      // Ignore cache write errors
    }
    return originalJson(body)
  }

  return next()
}

module.exports = { cache, buildCacheKey }

