require('dotenv').config()

const mongoose = require('mongoose')

const indexSpecs = [
  ['users', { email: 1 }, { unique: true }],
  ['users', { employeeId: 1 }, { unique: true, sparse: true }],
  ['users', { role: 1, isActive: 1 }],
  ['businessadvisors', { userId: 1 }, { unique: true }],
  ['candidates', { mobileNumber: 1 }],
  ['candidates', { submittedBy: 1, createdAt: -1 }],
  ['companies', { submittedBy: 1, createdAt: -1 }],
  ['crm_candidates', { mobileNumber: 1 }, { unique: true }],
  ['crm_candidates', { recruiterId: 1, callStatus: 1 }],
  ['crm_candidates', { callStatus: 1, createdAt: -1 }],
  ['crm_users', { employeeId: 1 }, { unique: true, sparse: true }],
  ['crm_call_logs', { candidateId: 1, calledAt: -1 }],
  ['crm_call_logs', { recruiterId: 1, calledAt: -1 }],
  ['ems_employees', { email: 1 }, { unique: true }],
  ['ems_employees', { department: 1, status: 1 }],
  ['ems_employees', { employeeId: 1 }, { unique: true }],
  ['ems_employees', { crmUserId: 1 }],
  ['ems_employees', { appUserId: 1 }],
  ['ems_attendance', { employee: 1, date: -1 }],
  ['ems_attendance', { date: 1, status: 1 }],
  ['ems_leaves', { employee: 1, status: 1 }],
  ['ems_payroll', { employee: 1, month: 1, year: 1 }, { unique: true }]
]

const connectOptions = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  compressors: 'zlib',
  heartbeatFrequencyMS: 10000
}

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(process.env.MONGODB_URI, connectOptions)

  for (const [collectionName, keys, options = {}] of indexSpecs) {
    const result = await mongoose.connection.db.collection(collectionName).createIndex(keys, options)
    console.log(`${collectionName}: ${result}`)
  }

  await mongoose.disconnect()
}

run().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
