const mongoose = require('mongoose')

const businessAdvisorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    fullName: String,
    phone: String,
    email: String,
    address: String,
    city: String,
    profilePhoto: String,
    documents: {
      aadharCard: {
        number: String,
        fileUrl: String
      },
      panCard: {
        number: String,
        fileUrl: String
      },
      cancelledCheque: {
        fileUrl: String
      },
      agreementLetter: {
        fileUrl: String
      }
    },
    bankDetails: {
      accountHolderName: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      branchName: String,
      accountType: {
        type: String,
        enum: ['Savings', 'Current']
      }
    },
    isProfileComplete: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('BusinessAdvisor', businessAdvisorSchema)
