const { redis } = require('../config/redis')

const normalizePrefix = (prefix) => {
  if (!prefix) return ''
  return prefix.startsWith('/') ? prefix : `/${prefix}`
}

// Deletes all GET cache entries whose URL begins with the given prefix.
// Example prefix: '/api/candidates'
const invalidateCache = async (prefix) => {
  if (!redis) return 0

  const normalized = normalizePrefix(prefix)
  const match = `GET:${normalized}*`

  let cursor = 0
  let deleted = 0

  do {
    // scan returns [nextCursor, keys]
    // eslint-disable-next-line no-await-in-loop
    const result = await redis.scan(cursor, { match, count: 200 })
    const nextCursor = Number(result?.[0] ?? 0)
    const keys = result?.[1] ?? []

    if (keys.length) {
      // eslint-disable-next-line no-await-in-loop
      const delCount = await redis.del(...keys)
      deleted += Number(delCount ?? 0)
    }

    cursor = nextCursor
  } while (cursor !== 0)

  return deleted
}

module.exports = { invalidateCache }

