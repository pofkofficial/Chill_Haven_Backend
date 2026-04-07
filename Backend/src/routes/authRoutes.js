const express = require('express');
const router = express.Router();
const { registerAdmin, loginAdmin } = require('../controllers/authController');

router.post('/register-admin', registerAdmin);   // Run this ONCE only
router.post('/login', loginAdmin);

module.exports = router;