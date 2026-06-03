require('dotenv').config()

const fs = require('fs/promises')
const path = require('path')
const mongoose = require('mongoose')

const { redis } = require('../src/config/redis')

const CONFIRMATION = 'RESET-DEMO-DATA'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const deleteLocalUploads = args.includes('--delete-local-uploads')

const readArg = (name) => {
  const prefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const confirmation = String(readArg('--confirm') || '')
const preservedSuperAdminEmail = String(readArg('--preserve-super-admin') || '')
  .trim()
  .toLowerCase()

const dataCollections = [
  'backup_audit_logs',
  'businessadvisors',
  'candidates',
  'cms_candidates',
  'cms_companies',
  'cms_interviews',
  'cms_pdf_shares',
  'cms_remarks',
  'companies',
  'company_admins',
  'company_interview_info',
  'crm_call_logs',
  'crm_candidates',
  'crm_users',
  'ems_attendance',
  'ems_departments',
  'ems_documents',
  'ems_employees',
  'ems_leave_balances',
  'ems_leaves',
  'ems_login_logs',
  'ems_office_locations',
  'ems_payroll',
  'ems_work_schedules',
  'placements',
  'students'
]

const backendRoot = path.resolve(__dirname, '..')
const localUploadRoots = [
  path.resolve(backendRoot, 'uploads'),
  path.resolve(backendRoot, 'tmp', 'uploads'),
  path.resolve(backendRoot, 'ems', 'uploads')
]

const isInside = (parent, child) => child.startsWith(`${parent}${path.sep}`)

const mongoTarget = (uri) => {
  try {
    const parsed = new URL(uri)
    return `${parsed.hostname}/${(parsed.pathname || '').replace(/^\//, '') || 'test'}`
  } catch (_error) {
    return 'unknown/unknown'
  }
}

const listLocalUploadFiles = async () => {
  const files = []

  const walk = async (root, current = root) => {
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      const entryPath = path.resolve(current, entry.name)
      if (!isInside(root, entryPath)) {
        throw new Error(`Refusing to inspect upload path outside expected root: ${entryPath}`)
      }

      if (entry.isDirectory()) {
        await walk(root, entryPath)
      } else {
        files.push(entryPath)
      }
    }
  }

  for (const root of localUploadRoots) {
    if (!isInside(backendRoot, root)) {
      throw new Error(`Refusing to inspect upload root outside backend: ${root}`)
    }
    await walk(root)
  }

  return files
}

const clearLocalUploadRoots = async () => {
  for (const root of localUploadRoots) {
    if (!isInside(backendRoot, root)) {
      throw new Error(`Refusing to clean upload root outside backend: ${root}`)
    }

    let entries = []
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }

    for (const entry of entries) {
      const entryPath = path.resolve(root, entry.name)
      if (!isInside(root, entryPath)) {
        throw new Error(`Refusing to remove upload path outside expected root: ${entryPath}`)
      }
      await fs.rm(entryPath, { recursive: true, force: true })
    }
  }
}

const clearGetCache = async () => {
  if (!redis) return 0

  let cursor = 0
  let deleted = 0

  do {
    // eslint-disable-next-line no-await-in-loop
    const result = await redis.scan(cursor, { match: 'GET:*', count: 200 })
    const nextCursor = Number(result?.[0] ?? 0)
    const keys = result?.[1] ?? []

    if (keys.length) {
      // eslint-disable-next-line no-await-in-loop
      deleted += Number((await redis.del(...keys)) || 0)
    }

    cursor = nextCursor
  } while (cursor !== 0)

  return deleted
}

const collectionCounts = async (database) => {
  const counts = {}
  for (const collectionName of dataCollections) {
    // eslint-disable-next-line no-await-in-loop
    counts[collectionName] = await database.collection(collectionName).countDocuments({})
  }
  return counts
}

const printCounts = (title, counts) => {
  console.log(`\n${title}`)
  Object.entries(counts).forEach(([name, count]) => {
    console.log(`- ${name}: ${count}`)
  })
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing in backend/.env')
  }

  if (!preservedSuperAdminEmail) {
    throw new Error('Pass --preserve-super-admin=<owner email> so the cleaned site keeps one login')
  }

  await mongoose.connect(process.env.MONGODB_URI)
  const database = mongoose.connection.db
  const users = database.collection('users')

  const preservedSuperAdmin = await users.findOne({
    email: preservedSuperAdminEmail,
    role: 'superAdmin'
  })

  if (!preservedSuperAdmin) {
    throw new Error(`Super Admin not found: ${preservedSuperAdminEmail}`)
  }

  const [beforeCounts, removableUsers, localFiles] = await Promise.all([
    collectionCounts(database),
    users
      .find(
        { _id: { $ne: preservedSuperAdmin._id } },
        { projection: { name: 1, email: 1, role: 1 } }
      )
      .sort({ role: 1, email: 1 })
      .toArray(),
    listLocalUploadFiles()
  ])

  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`)
  console.log(`MongoDB target: ${mongoTarget(process.env.MONGODB_URI)}`)
  console.log(`Preserving Super Admin: ${preservedSuperAdmin.email}`)
  printCounts('Data collections to clear:', beforeCounts)

  console.log(`\nDemo accounts to remove: ${removableUsers.length}`)
  removableUsers.forEach((user) => {
    console.log(`- ${user.role || 'unknown'} | ${user.name || '-'} | ${user.email || '-'}`)
  })

  console.log(`\nLocal upload files to remove: ${localFiles.length}`)
  localFiles.forEach((filePath) => console.log(`- ${path.relative(backendRoot, filePath)}`))

  if (!apply) {
    console.log('\nDry run only. No records or files were deleted.')
    console.log(
      `Run with --apply --confirm=${CONFIRMATION} --delete-local-uploads to perform the reset.`
    )
    return
  }

  if (confirmation !== CONFIRMATION) {
    throw new Error(`Deletion requires --confirm=${CONFIRMATION}`)
  }

  for (const collectionName of dataCollections) {
    // eslint-disable-next-line no-await-in-loop
    await database.collection(collectionName).deleteMany({})
  }

  await users.deleteMany({ _id: { $ne: preservedSuperAdmin._id } })

  if (deleteLocalUploads) {
    await clearLocalUploadRoots()
  }

  const deletedCacheKeys = await clearGetCache().catch((error) => {
    console.warn(`Could not clear Redis GET cache: ${error.message}`)
    return 0
  })

  const [afterCounts, remainingUsers, remainingLocalFiles] = await Promise.all([
    collectionCounts(database),
    users.find({}, { projection: { name: 1, email: 1, role: 1 } }).toArray(),
    listLocalUploadFiles()
  ])

  printCounts('Remaining data collection records:', afterCounts)
  console.log(`\nRemaining main accounts: ${remainingUsers.length}`)
  remainingUsers.forEach((user) => {
    console.log(`- ${user.role || 'unknown'} | ${user.name || '-'} | ${user.email || '-'}`)
  })
  console.log(`Remaining local upload files: ${remainingLocalFiles.length}`)
  console.log(`Cleared Redis GET cache keys: ${deletedCacheKeys}`)
}

main()
  .catch((error) => {
    console.error(`Reset failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
