const crypto = require('crypto');
const { razorpayInstance } = require('../config/razorpay');

/**
 * Creates a Razorpay Order
 * @param {Object} options
 * @param {number} options.amount - In smallest currency unit (e.g. paise: 9900 = ₹99)
 * @param {string} options.currency - e.g. "INR"
 * @param {string} options.receipt - Unique internal receipt string
 * @param {Object} [options.notes] - Additional metadata
 */
async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  if (razorpayInstance) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: Math.round(amount),
        currency,
        receipt,
        notes,
      });
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      };
    } catch (error) {
      console.error('[Razorpay API createOrder error]:', error);
      throw new Error(error.description || error.message || 'Failed to create Razorpay order');
    }
  }

  // Sandbox simulation fallback for testing when real Razorpay keys are not yet provided
  console.log('[Razorpay Sandbox Mode] Simulating order creation...');
  const simulatedId = `order_${crypto.randomBytes(10).toString('hex')}`;
  return {
    id: simulatedId,
    amount: Math.round(amount),
    currency,
    receipt,
    status: 'created',
  };
}

/**
 * Fetches order details from Razorpay
 */
async function fetchRazorpayOrder(orderId) {
  if (razorpayInstance) {
    try {
      return await razorpayInstance.orders.fetch(orderId);
    } catch (error) {
      console.error(`[Razorpay fetchOrder error for ${orderId}]:`, error);
      return null;
    }
  }
  return null;
}

/**
 * Fetches payment details from Razorpay
 */
async function fetchRazorpayPayment(paymentId) {
  if (razorpayInstance) {
    try {
      return await razorpayInstance.payments.fetch(paymentId);
    } catch (error) {
      console.error(`[Razorpay fetchPayment error for ${paymentId}]:`, error);
      return null;
    }
  }
  return null;
}

module.exports = {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
};
