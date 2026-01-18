const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

router.post('/create-order', checkoutController.createOrder);
router.post('/verify-payment', checkoutController.verifyPayment);

module.exports = router;