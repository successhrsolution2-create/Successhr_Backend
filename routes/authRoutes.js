const express = require('express')
const { login, me } = require('../controllers/authController')
const { verifyToken } = require('../middleware/authMiddleware')

const router = express.Router()

router.post('/login', login)
router.get('/me', verifyToken, me)

module.exports = router
