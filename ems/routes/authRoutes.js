const express = require('express')

const { changePassword, login, me, refreshToken } = require('../controllers/authController')
const { emsAuth } = require('../middleware/emsAuth')

const router = express.Router()

router.post('/login', login)
router.get('/me', emsAuth, me)
router.put('/password', emsAuth, changePassword)
router.post('/refresh-token', refreshToken)

module.exports = router
