const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const requiredEnv = ['AWS_REGION', 'AWS_S3_BUCKET']

const getMissing = () => requiredEnv.filter((key) => !process.env[key])

const buildS3Client = () => {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  }

  // Fallback to default AWS credential provider chain (IAM Role on EC2, etc.)
  return new S3Client({ region })
}

const s3Client = buildS3Client()

const sanitizeName = (name) => String(name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')

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

    const error = new Error(`S3 upload failed: ${message}`)
    error.statusCode = err?.$metadata?.httpStatusCode || 500
    throw error
  }

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}

module.exports = {
  uploadToS3
}
