process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.UPSTASH_REDIS_REST_URL = ''
process.env.UPSTASH_REDIS_REST_TOKEN = ''
process.env.MONGOMS_MD5_CHECK = 'false'

const fs = require('fs')
const systemMongoBinary = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe'
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(systemMongoBinary)) {
  process.env.MONGOMS_SYSTEM_BINARY = systemMongoBinary
  process.env.MONGOMS_VERSION = '8.2.1'
}

const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const request = require('supertest')

const User = require('../models/User')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const Candidate = require('../models/Candidate')
const Company = require('../models/Company')
const Placement = require('../models/Placement')
require('../models/cms/CmsCandidate')
require('../models/cms/CmsInterview')
require('../models/cms/CmsRemark')

let mongod
let sequence = 0

jest.setTimeout(120000)

const next = (prefix) => {
  sequence += 1
  return `${prefix}${sequence}`
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()))
})

afterEach(async () => {
  jest.clearAllMocks()

  if (mongoose.connection.readyState !== 1) return

  const collections = mongoose.connection.collections
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
})

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (mongod) {
    await mongod.stop()
  }
})

global.createSuperAdmin = async (overrides = {}) => {
  const email = overrides.email || next('admin') + '@test.com'
  return User.create({
    name: 'Super Admin',
    email,
    password: await bcrypt.hash(overrides.password || 'Admin@123', 10),
    role: 'superAdmin',
    isActive: true,
    ...overrides,
    email
  })
}

global.createCandidateAdmin = async (overrides = {}) => {
  const email = overrides.email || next('candidate-admin') + '@test.com'
  return User.create({
    name: 'Candidate Admin',
    email,
    password: await bcrypt.hash(overrides.password || 'Admin@123', 10),
    role: 'candidateAdmin',
    isActive: true,
    ...overrides,
    email
  })
}

global.createBA = async (overrides = {}) => {
  const email = overrides.email || next('ba') + '@test.com'
  const advisorCode = overrides.advisorCode || `successba${String(sequence + 1).padStart(2, '0')}`
  const user = await User.create({
    name: overrides.name || 'Test BA',
    email,
    password: await bcrypt.hash(overrides.password || 'BA@123', 10),
    role: 'businessAdvisor',
    advisorCode,
    isActive: true,
    ...overrides,
    email,
    advisorCode
  })

  await BusinessAdvisor.create({
    userId: user._id,
    fullName: user.name,
    email: user.email
  })

  return user
}

global.getToken = async (app, email, password) => {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  return res.body.token
}

global.createStudentForBA = async (baId, overrides = {}) => {
  const mobileNumber = overrides.mobileNumber || `98${String(10000000 + sequence).slice(-8)}`
  return Candidate.create({
    candidateName: overrides.candidateName || next('Candidate '),
    mobileNumber,
    submittedBy: baId,
    source: 'admin_panel',
    status: 'not_viewed',
    ...overrides,
    mobileNumber,
    submittedBy: baId
  })
}

global.createCompanyForBA = async (baId, overrides = {}) => {
  return Company.create({
    companyName: overrides.companyName || next('Company '),
    submittedBy: baId,
    status: 'not_viewed',
    ...overrides,
    submittedBy: baId
  })
}

global.createPlacementForBA = async (baId, overrides = {}) => {
  const candidate = overrides.candidateId
    ? { _id: overrides.candidateId }
    : await global.createStudentForBA(baId, overrides.candidate || {})
  const company = overrides.companyId
    ? { _id: overrides.companyId }
    : await global.createCompanyForBA(baId, overrides.company || {})

  return Placement.create({
    candidateId: candidate._id,
    companyId: company._id,
    baId,
    jobProfile: 'Sales Executive',
    offeredSalaryPM: 25000,
    salaryBasis: 1,
    earningPercent: 8.33,
    selectionStatus: 'selected',
    ...overrides,
    candidateId: candidate._id,
    companyId: company._id,
    baId
  })
}
