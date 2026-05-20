const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
// TODO: Upgrade the production Node.js runtime to >=22 before January 2027 for AWS SDK v3 support.
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

const requiredEnv = ['AWS_REGION', 'AWS_S3_BUCKET']

const getMissing = () => requiredEnv.filter((key) => !process.env[key])

const storageConfigError = (message) => {
  const error = new Error(message)
  error.statusCode = 503
  error.publicMessage = 'File upload storage is not configured. Please contact support.'
  return error
}

const storageUnavailableError = (message, statusCode = 503) => {
  const error = new Error(message)
  error.statusCode = statusCode
  error.publicMessage = 'File upload storage is temporarily unavailable. Please try again later.'
  return error
}

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
const localUploadRoot = path.join(__dirname, '..', 'uploads')
const localUploadUrlPrefix = '/uploads'

const isLocalUploadUrl = (value) => String(value || '').startsWith(`${localUploadUrlPrefix}/`)

const localContentType = (filePath) => {
  const ext = path.extname(filePath || '').toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  return 'application/octet-stream'
}

const uploadToLocalDisk = async (file, folder = 'uploads') => {
  if (!file?.buffer && !file?.path) {
    const error = new Error('Invalid file payload for upload')
    error.statusCode = 400
    throw error
  }

  const safeFolder = sanitizeName(folder)
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeName(file.originalname)}`
  const uploadDir = path.join(localUploadRoot, safeFolder)
  const uploadPath = path.join(uploadDir, fileName)

  await fsp.mkdir(uploadDir, { recursive: true })
  if (file.buffer) {
    await fsp.writeFile(uploadPath, file.buffer)
  } else {
    await fsp.copyFile(file.path, uploadPath)
  }

  return `${localUploadUrlPrefix}/${safeFolder}/${fileName}`
}

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
    return uploadToLocalDisk(file, folder)
  }

  if (!file?.buffer && !file?.path) {
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
        Body: file.buffer || fs.createReadStream(file.path),
        ContentType: file.mimetype,
        ContentLength: file.size
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
      throw storageConfigError(
        'S3 upload failed: AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend/.env (or configure an AWS profile/IAM role).'
      )
    }

    if (
      message.toLowerCase().includes('must be addressed using the specified endpoint') ||
      name === 'PermanentRedirect' ||
      bucketRegion
    ) {
      const hint = bucketRegion
        ? ` Bucket region appears to be "${bucketRegion}".`
        : ''
      throw storageConfigError(
        `S3 upload failed: bucket endpoint/region mismatch.${hint} Update AWS_REGION (and optionally AWS_S3_ENDPOINT) in backend/.env.`
      )
    }

    throw storageUnavailableError(`S3 upload failed: ${message}`, err?.$metadata?.httpStatusCode || 503)
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
    if (isLocalUploadUrl(fileUrlOrKey)) {
      const relativePath = trimSlashes(String(fileUrlOrKey).slice(localUploadUrlPrefix.length))
      const filePath = path.resolve(localUploadRoot, relativePath)
      if (!filePath.startsWith(path.resolve(localUploadRoot) + path.sep)) {
        const error = new Error('Invalid local file path')
        error.statusCode = 400
        throw error
      }

      const stat = await fsp.stat(filePath)
      return {
        Body: fs.createReadStream(filePath),
        ContentType: localContentType(filePath),
        ContentLength: stat.size
      }
    }

    const missing = getMissing()
    if (missing.length) {
      throw storageConfigError(`Missing S3 env vars: ${missing.join(', ')}`)
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
