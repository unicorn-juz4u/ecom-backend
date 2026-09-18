const crypto = require('crypto');

/**
 * Verifies Razorpay payment signature using HMAC SHA256
 * @param {Object} params
 * @param {string} params.razorpay_order_id
 * @param {string} params.razorpay_payment_id
 * @param {string} params.razorpay_signature
 * @param {string} keySecret
 * @returns {boolean}
 */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, keySecret) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !keySecret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(razorpay_signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('[Payment Signature Verification Error]:', error.message);
    return false;
  }
}

/**
 * Verifies Razorpay webhook signature using raw body buffer and HMAC SHA256
 * @param {Buffer|string} rawBody
 * @param {string} signature
 * @param {string} webhookSecret
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }

  try {
    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('[Webhook Signature Verification Error]:', error.message);
    return false;
  }
}

/**
 * Generates a cryptographically random, high-entropy download token
 * @returns {string} 64-character hex string
 */
function generateDownloadToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  verifyPaymentSignature,
  verifyWebhookSignature,
  generateDownloadToken,
};
