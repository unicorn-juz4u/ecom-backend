const Razorpay = require('razorpay');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

let razorpayInstance = null;

if (keyId && keySecret && !keyId.includes('placeholder')) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    console.log('[Razorpay] Initialized official SDK with key ID:', keyId.substring(0, 12) + '...');
  } catch (error) {
    console.error('[Razorpay Initialization Error]:', error.message);
  }
} else {
  console.log('[Razorpay] Using test / sandbox configuration mode. (Add real rzp_test_ keys in .env to call live Razorpay endpoints)');
}

module.exports = {
  razorpayInstance,
  getRazorpayKeyId: () => process.env.RAZORPAY_KEY_ID || '',
  getRazorpayKeySecret: () => process.env.RAZORPAY_KEY_SECRET || '',
  getWebhookSecret: () => process.env.RAZORPAY_WEBHOOK_SECRET || '',
};
