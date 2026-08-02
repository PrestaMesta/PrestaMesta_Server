const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

// Endpoints: /api/admin/auth/register y /api/admin/auth/login
router.post('/register', adminAuthController.registerAdmin);
router.post('/login', adminAuthController.loginAdmin);

module.exports = router;