const bcrypt = require('bcryptjs')
const User = require('../models/User')
const BusinessAdvisor = require('../models/BusinessAdvisor')

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
  const { name, email, password, phone, address, city, isActive, documents, bankDetails } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const exists = await User.findOne({ email: normalizedEmail })

  if (exists) {
    return res.status(409).json({ message: 'A user with this email already exists' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await User.create({
    name,
    email: normalizedEmail,
    password: hashed,
    role: 'businessAdvisor',
    isActive: isActive === undefined ? true : Boolean(isActive)
  })

  const profile = await BusinessAdvisor.create({
    userId: user._id,
    fullName: name,
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

  res.status(201).json({ user, profile })
}

const updateBusinessAdvisorUser = async (req, res) => {
  const { name, email, isActive } = req.body
  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' })

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  if (email && email.toLowerCase().trim() !== user.email) {
    const exists = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: user._id } })

    if (exists) {
      return res.status(409).json({ message: 'A user with this email already exists' })
    }

    user.email = email.toLowerCase().trim()
  }

  if (name !== undefined) user.name = name
  if (isActive !== undefined) user.isActive = Boolean(isActive)

  await user.save()

  const profileUpdates = {}
  if (name !== undefined) profileUpdates.fullName = name
  if (email !== undefined) profileUpdates.email = user.email

  if (Object.keys(profileUpdates).length > 0) {
    await BusinessAdvisor.findOneAndUpdate({ userId: user._id }, { $set: profileUpdates })
  }

  res.json({ user })
}

const resetBusinessAdvisorPassword = async (req, res) => {
  const { newPassword } = req.body

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' })
  }

  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' }).select('+password')

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  user.password = await bcrypt.hash(newPassword, 10)
  await user.save()

  res.json({ message: 'Password reset successfully' })
}

const deleteBusinessAdvisorUser = async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'businessAdvisor' })

  if (!user) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  await BusinessAdvisor.deleteOne({ userId: user._id })
  await user.deleteOne()

  res.json({ message: 'Business Advisor removed' })
}

module.exports = {
  listBusinessAdvisors,
  createBusinessAdvisor,
  updateBusinessAdvisorUser,
  resetBusinessAdvisorPassword,
  deleteBusinessAdvisorUser
}
