const DEFAULT_PARAMETER_NAMES = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CRM_JWT_SECRET',
  'EMS_JWT_SECRET',
  'EMS_REFRESH_SECRET',
  'COMPANY_ADMIN_JWT_SECRET',
  'BACKUP_JWT_SECRET',
  'BACKUP_DOWNLOAD_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
]

const parameterNames = () =>
  String(process.env.AWS_PARAMETER_NAMES || DEFAULT_PARAMETER_NAMES.join(','))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

const loadParameterStoreEnv = async () => {
  const prefix = String(process.env.AWS_PARAMETER_PREFIX || '').replace(/\/$/, '')
  const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || '2773'
  const token = process.env.AWS_SESSION_TOKEN

  if (!prefix || !token || typeof fetch !== 'function') return

  await Promise.all(
    parameterNames().map(async (envName) => {
      if (process.env[envName]) return

      const name = encodeURIComponent(`${prefix}/${envName}`)
      const response = await fetch(
        `http://localhost:${port}/systemsmanager/parameters/get?name=${name}&withDecryption=true`,
        {
          headers: {
            'X-Aws-Parameters-Secrets-Token': token
          }
        }
      )

      if (!response.ok) return
      const payload = await response.json()
      const value = payload?.Parameter?.Value
      if (value) process.env[envName] = value
    })
  )
}

module.exports = { loadParameterStoreEnv, DEFAULT_PARAMETER_NAMES }
