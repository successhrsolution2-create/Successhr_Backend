const bcrypt = require('bcryptjs')
const User = require('../models/User')
const BusinessAdvisor = require('../models/BusinessAdvisor')
const Candidate = require('../models/Candidate')
const Company = require('../models/Company')
const Placement = require('../models/Placement')
const CmsCandidate = require('../models/cms/CmsCandidate')
const { invalidateCache } = require('../src/utils/invalidateCache')
const generateAdvisorCode = require('../utils/generateAdvisorCode')

const isText = (value) => typeof value === 'string'
const trimmedText = (value) => (isText(value) ? value.trim() : '')
const isPlainObject = (value) => value === undefined || (value && typeof value === 'object' && !Array.isArray(value))
const requestBody = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {})
const PASSWORD_MAX_LENGTH = 72

const validateBusinessAdvisorPayload = (rawBody = {}, { partial = false } = {}) => {
  const body = requestBody(rawBody)
  const { name, email, password, isActive, documents, bankDetails } = body

  if (!partial && (!trimmedText(name) || !trimmedText(email) || !isText(password) || !password)) {
    return 'Name, email, and password are required'
  }

  if (name !== undefined && !trimmedText(name)) return 'Name must be text'
  if (email !== undefined && !trimmedText(email)) return 'Email must be text'
  if (password !== undefined && !isText(password)) return 'Password must be text'
  if (isText(password) && password.length > PASSWORD_MAX_LENGTH) return `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`
  if (isActive !== undefined && typeof isActive !== 'boolean') return 'isActive must be true or false'
  if (!isPlainObject(documents)) return 'Documents must be an object'
  if (!isPlainObject(bankDetails)) return 'Bank details must be an object'

  return null
}

const invalidateBusinessAdvisorCaches = (userId) =>
  Promise.all([
    invalidateCache('/api/ba/all').catch(() => 0),
    invalidateCache('/api/ba/profile').catch(() => 0),
    userId ? invalidateCache(`/api/ba/profile/${userId}`).catch(() => 0) : Promise.resolve(0),
    userId ? invalidateCache(`/api/ba/${userId}/public-form-count`).catch(() => 0) : Promise.resolve(0)
  ])

const assignAdvisorCode = async (user) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      user.advisorCode = await generateAdvisorCode()
      await user.save()
      return
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.advisorCode) {
        throw error
      }
    }
  }

  const error = new Error('Could not generate a unique advisor code')
  error.statusCode = 500
  throw error
}

const isProfileComplete = (profile) => {
  const personalComplete = Boolean(
    profile.fullName &&
      profile.phone &&
      profile.email &&
      profile.address &&
      profile.city &&
      profile.profilePhoto
  )

  const docs = profile.documents || {}
  const docsComplete = Boolean(
    docs.aadharCard?.number?.match(/^\d{12}$/) &&
      docs.aadharCard?.fileUrl &&
      docs.panCard?.number?.match(/^[A-Z0-9]{10}$/) &&
      docs.panCard?.fileUrl &&
      docs.cancelledCheque?.fileUrl &&
      docs.agreementLetter?.fileUrl
  )

  const bank = profile.bankDetails || {}
  const bankComplete = Boolean(
    bank.accountHolderName &&
      bank.bankName &&
      bank.accountNumber &&
      bank.ifscCode &&
      bank.branchName &&
      bank.accountType
  )

  return personalComplete && docsComplete && bankComplete
}

const listBusinessAdvisors = async (_req, res) => {
  const users = await User.find({ role: 'businessAdvisor' }).sort({ createdAt: -1 })
  const profiles = await BusinessAdvisor.find({ userId: { $in: users.map((user) => user._id) } })
  const profileMap = new Map(profiles.map((profile) => [profile.userId.toString(), profile]))

  res.json(
    users.map((user) => ({
      ...user.toJSON(),
      profile: profileMap.get(user._id.toString()) || null
    }))
  )
}

const createBusinessAdvisor = async (req, res) => {
  const body = requestBody(req.body)
  const { name, email, password, phone, address, city, isActive, documents, bankDetails } = body

  const validationError = validateBusinessAdvisorPayload(body)
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }

  const normalizedName = trimmedText(name)
  const normalizedEmail = trimmedText(email).toLowerCase()
  const exists = await User.findOne({ email: normalizedEmail })

  if (exists) {
    return res.status(409).json({ message: 'A user with this email already exists' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    password: hashed,
    role: 'businessAdvisor',
    isActive: isActive === undefined ? true : Boolean(isActive)
  })

  await assignAdvisorCode(user)

  const profile = await BusinessAdvisor.create({
    userId: user._id,
    fullName: normalizedName,
    email: normalizedEmail,
    phone,
    address,
    city,
    documents: {
      aadharCard: {
        number: documents?.aadharCard?.number,
        fileUrl: documents?.aadharCard?.fileUrl
      },
      panCard: {
        number: documents?.panCard?.number?.toUpperCase(),
        fileUrl: documents?.panCard?.fileUrl
      },
      cancelledCheque: {
        fileUrl: documents?.cancelledCheque?.fileUrl
      },
      agreementLetter: {
        fileUrl: documents?.agreementLetter?.fileUrl
      }
    },
    bankDetails: {
      ...bankDetails,
      ifscCode: bankDetails?.ifscCode?.toUpperCase()
    }
  })

  profile.isProfileComplete = isProfileComplete(profile)
  await profile.save()

  await invalidateBusinessAdvisorCaches(user._id)
  res.status(201).json({ user, profile })
}

const updateBusinessAdvisorUser = async (req, res) => {
  const body = requestBody(req.body)
  const { name, email, isActive } = body
  const validationError = validateBusinessAdvisorPayload(body, { partial: true })
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }

  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' })

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  const normalizedEmail = email !== undefined ? trimmedText(email).toLowerCase() : undefined
  if (normalizedEmail && normalizedEmail !== user.email) {
    const exists = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } })

    if (exists) {
      return res.status(409).json({ message: 'A user with this email already exists' })
    }

    user.email = normalizedEmail
  }

  if (name !== undefined) user.name = trimmedText(name)
  if (isActive !== undefined) user.isActive = isActive

  await user.save()

  const profileUpdates = {}
  if (name !== undefined) profileUpdates.fullName = trimmedText(name)
  if (email !== undefined) profileUpdates.email = user.email

  if (Object.keys(profileUpdates).length > 0) {
    await BusinessAdvisor.findOneAndUpdate({ userId: user._id }, { $set: profileUpdates })
  }

  await invalidateBusinessAdvisorCaches(user._id)
  res.json({ user })
}

const resetBusinessAdvisorPassword = async (req, res) => {
  const { newPassword } = requestBody(req.body)

  if (!isText(newPassword) || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' })
  }

  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    return res.status(400).json({ message: `New password cannot exceed ${PASSWORD_MAX_LENGTH} characters` })
  }

  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' }).select('+password')

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  user.password = await bcrypt.hash(newPassword, 10)
  user.tokenVersion = Number(user.tokenVersion || 0) + 1
  await user.save()

  await invalidateBusinessAdvisorCaches(user._id)
  res.json({ message: 'Password reset successfully' })
}

const deleteBusinessAdvisorUser = async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' })

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  const [candidateCount, companyCount, placementCount, cmsCandidateCount] = await Promise.all([
    Candidate.countDocuments({ submittedBy: user._id }),
    Company.countDocuments({ submittedBy: user._id }),
    Placement.countDocuments({ baId: user._id }),
    CmsCandidate.countDocuments({ advisor: user._id })
  ])

  if (candidateCount || companyCount || placementCount || cmsCandidateCount) {
    return res.status(409).json({
      message: 'Business Advisor has linked records. Reassign or delete their candidates, companies, and placements first.',
      linkedRecords: {
        candidates: candidateCount,
        companies: companyCount,
        placements: placementCount,
        cmsCandidates: cmsCandidateCount
      }
    })
  }

  await BusinessAdvisor.deleteOne({ userId: user._id })
  await user.deleteOne()

  await invalidateBusinessAdvisorCaches(user._id)
  res.json({ message: 'Business Advisor removed' })
}

module.exports = {
  listBusinessAdvisors,
  createBusinessAdvisor,
  updateBusinessAdvisorUser,
  resetBusinessAdvisorPassword,
  deleteBusinessAdvisorUser
}
