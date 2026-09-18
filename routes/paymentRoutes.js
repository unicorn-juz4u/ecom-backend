const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Create payment order
router.post('/create-order', paymentController.createOrder);

// Verify payment signature
router.post('/verify', paymentController.verifyPayment);

// Get payment status
router.get('/status/:orderId', paymentController.getOrderStatus);

// Secure tokenized digital product download
router.get('/download/:token', paymentController.downloadAsset);

// Webhook endpoint (Raw body is captured in express json middleware)
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
