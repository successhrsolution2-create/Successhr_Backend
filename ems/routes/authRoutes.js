const express = require('express')

const { login, me, refreshToken } = require('../controllers/authController')
const { emsAuth } = require('../middleware/emsAuth')

const router = express.Router()

router.post('/login', login)
router.get('/me', emsAuth, me)
router.post('/refresh-token', refreshToken)

module.exports = router
