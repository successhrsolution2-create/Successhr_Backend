const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')

const requiredEnv = ['AWS_REGION', 'AWS_S3_BUCKET']

const getMissing = () => requiredEnv.filter((key) => !process.env[key])

const buildS3Client = () => {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const endpoint = process.env.AWS_S3_ENDPOINT
  const forcePathStyle = String(process.env.AWS_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'

  const baseConfig = {
    region,
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle ? { forcePathStyle: true } : {})
  }

  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      ...baseConfig,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  }

  // Fallback to default AWS credential provider chain (IAM Role on EC2, etc.)
  return new S3Client(baseConfig)
}

const s3Client = buildS3Client()

const sanitizeName = (name) => String(name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')
const trimSlashes = (value) => String(value || '').replace(/^\/+|\/+$/g, '')
const normalizeEndpoint = (value) => String(value || '').trim().replace(/\/$/, '')

const s3KeyFromFileUrl = (fileUrl) => {
  const raw = String(fileUrl || '').trim()
  if (!raw) return ''

  if (!/^https?:\/\//i.test(raw)) {
    return trimSlashes(raw)
  }

  try {
    const parsed = new URL(raw)
    const customEndpoint = normalizeEndpoint(process.env.AWS_S3_ENDPOINT)

    if (customEndpoint && raw.startsWith(customEndpoint)) {
      const path = trimSlashes(parsed.pathname)
      const bucket = trimSlashes(process.env.AWS_S3_BUCKET)
      if (path.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) {
        return path.slice(bucket.length + 1)
      }
      return path
    }

    return trimSlashes(parsed.pathname)
  } catch (_error) {
    return trimSlashes(raw)
  }
}

const uploadToS3 = async (file, folder = 'uploads') => {
  const missing = getMissing()
  if (missing.length) {
    const error = new Error(`Missing S3 env vars: ${missing.join(', ')}`)
    error.statusCode = 500
    throw error
  }

  if (!file?.buffer) {
    const error = new Error('Invalid file payload for upload')
    error.statusCode = 400
    throw error
  }

  const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeName(file.originalname)}`

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      })
    )
  } catch (err) {
    const message = String(err?.message || err || 'S3 upload failed')
    const name = String(err?.name || '')
    const bucketRegion = err?.$response?.headers?.['x-amz-bucket-region'] || err?.BucketRegion

    if (
      name.toLowerCase().includes('credentials') ||
      message.toLowerCase().includes('credential') ||
      message.toLowerCase().includes('could not load credentials')
    ) {
      const error = new Error(
        'S3 upload failed: AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend/.env (or configure an AWS profile/IAM role).'
      )
      error.statusCode = 500
      throw error
    }

    if (
      message.toLowerCase().includes('must be addressed using the specified endpoint') ||
      name === 'PermanentRedirect' ||
      bucketRegion
    ) {
      const hint = bucketRegion
        ? ` Bucket region appears to be "${bucketRegion}".`
        : ''
      const error = new Error(
        `S3 upload failed: bucket endpoint/region mismatch.${hint} Update AWS_REGION (and optionally AWS_S3_ENDPOINT) in backend/.env.`
      )
      error.statusCode = 500
      throw error
    }

    const error = new Error(`S3 upload failed: ${message}`)
    error.statusCode = err?.$metadata?.httpStatusCode || 500
    throw error
  }

  const customEndpoint = String(process.env.AWS_S3_ENDPOINT || '').trim().replace(/\/$/, '')
  const forcePathStyle = String(process.env.AWS_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'
  if (customEndpoint) {
    if (forcePathStyle) {
      return `${customEndpoint}/${process.env.AWS_S3_BUCKET}/${key}`
    }
    return `${customEndpoint}/${key}`
  }

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}

module.exports = {
  uploadToS3,
  getObjectFromS3: async (fileUrlOrKey) => {
    const missing = getMissing()
    if (missing.length) {
      const error = new Error(`Missing S3 env vars: ${missing.join(', ')}`)
      error.statusCode = 500
      throw error
    }

    const key = s3KeyFromFileUrl(fileUrlOrKey)
    if (!key) {
      const error = new Error('Invalid S3 file key')
      error.statusCode = 400
      throw error
    }

    return s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      })
    )
  }
}
