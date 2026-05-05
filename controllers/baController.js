const BusinessAdvisor = require('../models/BusinessAdvisor')
const User = require('../models/User')

const documentUrl = (file) => `/uploads/${file.filename}`

const isComplete = (profile) => {
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

const ensureProfile = async (user) => {
  let profile = await BusinessAdvisor.findOne({ userId: user._id })

  if (!profile) {
    profile = await BusinessAdvisor.create({
      userId: user._id,
      fullName: user.name,
      email: user.email
    })
  }

  return profile
}

const ensureProfileForUserId = async (userId) => {
  const user = await User.findOne({ _id: userId, role: 'businessAdvisor' })

  if (!user) {
    return null
  }

  return ensureProfile(user)
}

const applyProfileBody = (profile, body, email) => {
  ;['fullName', 'phone', 'address', 'city'].forEach((field) => {
    if (body[field] !== undefined) profile[field] = body[field]
  })

  if (email !== undefined) {
    profile.email = email
  }

  if (body.documents) {
    profile.documents = {
      ...profile.documents?.toObject?.(),
      ...profile.documents,
      aadharCard: {
        ...profile.documents?.aadharCard?.toObject?.(),
        ...profile.documents?.aadharCard,
        ...body.documents.aadharCard
      },
      panCard: {
        ...profile.documents?.panCard?.toObject?.(),
        ...profile.documents?.panCard,
        ...(body.documents.panCard
          ? { ...body.documents.panCard, number: body.documents.panCard.number?.toUpperCase() }
          : {})
      },
      cancelledCheque: {
        ...profile.documents?.cancelledCheque?.toObject?.(),
        ...profile.documents?.cancelledCheque,
        ...body.documents.cancelledCheque
      },
      agreementLetter: {
        ...profile.documents?.agreementLetter?.toObject?.(),
        ...profile.documents?.agreementLetter,
        ...body.documents.agreementLetter
      }
    }
  }

  if (body.bankDetails) {
    profile.bankDetails = {
      ...profile.bankDetails?.toObject?.(),
      ...profile.bankDetails,
      ...body.bankDetails,
      ifscCode: body.bankDetails.ifscCode?.toUpperCase() || profile.bankDetails?.ifscCode
    }
  }

  profile.isProfileComplete = isComplete(profile)
}

const attachUploadedFile = (profile, docType, fileUrl) => {
  profile.documents = profile.documents || {}

  if (docType === 'profilePhoto') {
    profile.profilePhoto = fileUrl
  } else if (docType === 'aadharCard') {
    profile.documents.aadharCard = {
      ...(profile.documents.aadharCard?.toObject?.() || profile.documents.aadharCard || {}),
      fileUrl
    }
  } else if (docType === 'panCard') {
    profile.documents.panCard = {
      ...(profile.documents.panCard?.toObject?.() || profile.documents.panCard || {}),
      fileUrl
    }
  } else if (docType === 'cancelledCheque') {
    profile.documents.cancelledCheque = { fileUrl }
  } else if (docType === 'agreementLetter') {
    profile.documents.agreementLetter = { fileUrl }
  } else {
    return false
  }

  profile.isProfileComplete = isComplete(profile)
  return true
}

const getOwnProfile = async (req, res) => {
  const profile = await ensureProfile(req.user)
  res.json(profile)
}

const getProfileByUserId = async (req, res) => {
  const profile = await BusinessAdvisor.findOne({ userId: req.params.userId }).populate(
    'userId',
    'name email isActive role'
  )

  if (!profile) {
    return res.status(404).json({ message: 'Business Advisor profile not found' })
  }

  res.json(profile)
}

const updateOwnProfile = async (req, res) => {
  const profile = await ensureProfile(req.user)
  applyProfileBody(profile, req.body, req.user.email)
  await profile.save()

  res.json(profile)
}

const updateProfileByUserId = async (req, res) => {
  const profile = await ensureProfileForUserId(req.params.userId)

  if (!profile) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  const user = await User.findById(req.params.userId)
  applyProfileBody(profile, req.body, user.email)
  await profile.save()

  res.json(await BusinessAdvisor.findById(profile._id).populate('userId', 'name email isActive role createdAt'))
}

const uploadProfileDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' })
  }

  const { docType } = req.body
  const profile = await ensureProfile(req.user)
  const fileUrl = documentUrl(req.file)

  if (!attachUploadedFile(profile, docType, fileUrl)) {
    return res.status(400).json({ message: 'Invalid document type' })
  }

  await profile.save()

  res.json({ profile, fileUrl })
}

const uploadProfileDocumentByUserId = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' })
  }

  const { docType } = req.body
  const profile = await ensureProfileForUserId(req.params.userId)

  if (!profile) {
    return res.status(404).json({ message: 'Business Advisor not found' })
  }

  const fileUrl = documentUrl(req.file)

  if (!attachUploadedFile(profile, docType, fileUrl)) {
    return res.status(400).json({ message: 'Invalid document type' })
  }

  await profile.save()

  res.json({
    profile: await BusinessAdvisor.findById(profile._id).populate('userId', 'name email isActive role createdAt'),
    fileUrl
  })
}

const listAllProfiles = async (_req, res) => {
  const profiles = await BusinessAdvisor.find()
    .populate('userId', 'name email isActive role createdAt')
    .sort({ createdAt: -1 })

  const existingUserIds = profiles.map((profile) => profile.userId?._id).filter(Boolean)
  const usersWithoutProfiles = await User.find({
    role: 'businessAdvisor',
    _id: { $nin: existingUserIds }
  })

  const createdProfiles = await Promise.all(usersWithoutProfiles.map((user) => ensureProfile(user)))
  const hydratedCreatedProfiles = await BusinessAdvisor.find({
    _id: { $in: createdProfiles.map((profile) => profile._id) }
  }).populate('userId', 'name email isActive role createdAt')

  res.json([...profiles, ...hydratedCreatedProfiles])
}

module.exports = {
  getOwnProfile,
  getProfileByUserId,
  updateOwnProfile,
  updateProfileByUserId,
  uploadProfileDocument,
  uploadProfileDocumentByUserId,
  listAllProfiles
}
