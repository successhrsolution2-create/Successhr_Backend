const crypto = require('crypto')

const DOWNLOAD_TOKEN_TTL_MS = 60 * 1000
const downloadTokens = new Map()

const getDownloadSecret = () => {
  const secret = process.env.BACKUP_DOWNLOAD_SECRET
  if (!secret || String(secret).length < 32) {
    throw new Error('BACKUP_DOWNLOAD_SECRET must be configured with at least 32 characters')
  }
  return secret
}

const signPayload = (payload) =>
  crypto
    .createHmac('sha256', getDownloadSecret())
    .update(JSON.stringify(payload))
    .digest('hex')

const generateDownloadToken = (adminId, panels, fromDate, toDate) => {
  const tokenId = crypto.randomBytes(32).toString('hex')
  const payload = {
    tokenId,
    adminId: String(adminId || ''),
    panels,
    fromDate,
    toDate
  }
  const signature = signPayload(payload)

  downloadTokens.set(tokenId, {
    ...payload,
    signature,
    expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
    used: false
  })

  setTimeout(() => downloadTokens.delete(tokenId), DOWNLOAD_TOKEN_TTL_MS + 1000).unref?.()
  return `${tokenId}.${signature}`
}

const consumeDownloadToken = (token) => {
  const [tokenId, signature] = String(token || '').split('.')
  if (!tokenId || !signature) return { valid: false, reason: 'Token is invalid' }

  const stored = downloadTokens.get(tokenId)
  if (!stored) return { valid: false, reason: 'Token not found or expired' }
  if (stored.used) return { valid: false, reason: 'Token already used' }

  if (Date.now() > stored.expiresAt) {
    downloadTokens.delete(tokenId)
    return { valid: false, reason: 'Token expired' }
  }

  const expected = Buffer.from(stored.signature)
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'Token signature invalid' }
  }

  stored.used = true
  downloadTokens.set(tokenId, stored)
  setTimeout(() => downloadTokens.delete(tokenId), 1000).unref?.()

  return { valid: true, data: stored }
}

const generateBackupAccessToken = (user) => {
  const secret = process.env.BACKUP_JWT_SECRET
  if (!secret || String(secret).length < 32) {
    throw new Error('BACKUP_JWT_SECRET must be configured with at least 32 characters')
  }

  return require('jsonwebtoken').sign(
    {
      _id: String(user._id),
      email: user.email,
      role: 'super_admin'
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: '5m'
    }
  )
}

module.exports = { consumeDownloadToken, generateBackupAccessToken, generateDownloadToken }
