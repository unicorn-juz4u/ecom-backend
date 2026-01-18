const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');

// Definition of Auth Routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// IMPORTANT: This is a temporary route for development to create an admin.
// REMOVE this route in production for security reasons.
router.put('/make-admin', authController.makeAdmin);

module.exports = router;