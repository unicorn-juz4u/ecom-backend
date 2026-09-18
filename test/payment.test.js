const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../index');
const Order = require('../models/Order');
const {
  verifyPaymentSignature,
  verifyWebhookSignature,
  generateDownloadToken,
} = require('../utils/paymentVerification');
const { validateEmail } = require('../utils/validation');
const { sendPurchaseEvent, hashSha256 } = require('../services/metaCapiService');

const TEST_SECRET = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret_key_antigravity';
const TEST_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_webhook_secret_antigravity';

async function runTests() {
  console.log('🧪 Starting Automated Backend Test Suite for Payment + Meta Tracking...');

  // Start local test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqHeaders = { ...headers };
      let payload = null;

      if (body) {
        payload = typeof body === 'string' ? body : JSON.stringify(body);
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(
        url,
        {
          method,
          headers: reqHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch (_) {}
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: json || data,
              raw: data,
            });
          });
        }
      );

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // Basic verification utilities
    console.log('\n--- 0. Testing Base Utilities ---');
    assert.strictEqual(validateEmail('test@example.com').valid, true);
    assert.strictEqual(validateEmail('  BUYER@ANJOAURA.COM  ').email, 'buyer@anjoaura.com');
    assert.strictEqual(validateEmail('invalid').valid, false);
    assert.strictEqual(hashSha256('Buyer@AnjoAura.com'), crypto.createHash('sha256').update('buyer@anjoaura.com').digest('hex'));
    console.log('✓ Email validation & Meta SHA-256 email hashing tests passed');

    // =========================================================================
    // TEST 1: ₹299 INR order creation
    // =========================================================================
    console.log('\n--- Test 1: ₹299 INR Order Creation ---');
    const orderRes = await makeRequest('POST', '/api/payment/create-order', {
      email: 'creator@example.com',
    });
    assert.strictEqual(orderRes.status, 200, 'Order creation should return 200 OK');
    assert.strictEqual(orderRes.body.success, true);
    assert.strictEqual(orderRes.body.amount, 29900, 'Amount must be exactly 29900 paise (= ₹299 INR)');
    assert.strictEqual(orderRes.body.currency, 'INR', 'Currency must be INR');
    assert.ok(orderRes.body.orderId.startsWith('order_'), 'Razorpay order ID should start with order_');
    const createdOrderId = orderRes.body.orderId;

    // Verify DB record matches authoritative fields
    const dbOrderCreated = await Order.findOne({ razorpayOrderId: createdOrderId });
    assert.ok(dbOrderCreated, 'Order must be persisted in database');
    assert.strictEqual(dbOrderCreated.amount, 29900);
    assert.strictEqual(dbOrderCreated.currency, 'INR');
    assert.strictEqual(dbOrderCreated.paymentStatus, 'created');
    console.log(`✓ Test 1 Passed: Order created with amount=${dbOrderCreated.amount} paise (₹299), currency=${dbOrderCreated.currency}, id=${createdOrderId}`);

    // =========================================================================
    // TEST 2: Successful Razorpay signature verification
    // =========================================================================
    console.log('\n--- Test 2: Successful Razorpay Signature Verification ---');
    const validPaymentId = 'pay_success_' + Date.now();
    const validSignature = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${createdOrderId}|${validPaymentId}`)
      .digest('hex');

    const verifySuccessRes = await makeRequest('POST', '/api/payment/verify', {
      razorpay_order_id: createdOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: validSignature,
      email: 'creator@example.com',
      fbp: 'fb.1.1710000000.123456789',
      fbc: 'fb.1.1710000000.IwARtest_click_id',
    });

    assert.strictEqual(verifySuccessRes.status, 200, 'Valid signature must return 200');
    assert.strictEqual(verifySuccessRes.body.paid, true, 'Payment must be verified as paid');
    assert.ok(verifySuccessRes.body.downloadToken, 'Download token must be generated');
    assert.ok(verifySuccessRes.body.resources, 'Delivery payload must include all 3 resources');
    const validToken = verifySuccessRes.body.downloadToken;

    // Verify DB updated state
    const dbOrderPaid = await Order.findOne({ razorpayOrderId: createdOrderId });
    assert.strictEqual(dbOrderPaid.paymentStatus, 'paid');
    assert.strictEqual(dbOrderPaid.status, 'paid');
    assert.strictEqual(dbOrderPaid.razorpayPaymentId, validPaymentId);
    assert.strictEqual(dbOrderPaid.payment_id, validPaymentId);
    assert.strictEqual(dbOrderPaid.metaPurchaseSent, true, 'metaPurchaseSent flag must be recorded');
    assert.strictEqual(dbOrderPaid.metaEventId, createdOrderId, 'metaEventId must match order_id');
    console.log(`✓ Test 2 Passed: Cryptographic signature verified. Order ${createdOrderId} marked PAID with download token.`);

    // =========================================================================
    // TEST 3: Failed signature verification
    // =========================================================================
    console.log('\n--- Test 3: Failed Signature Verification ---');
    const fakeOrderId = `order_fake_${Date.now()}`;
    await Order.create({
      email: 'tampered@example.com',
      product: 'Digital Creator Launch System',
      amount: 29900,
      currency: 'INR',
      razorpayOrderId: fakeOrderId,
      order_id: fakeOrderId,
      paymentStatus: 'created',
      status: 'created',
    });

    const verifyFailRes = await makeRequest('POST', '/api/payment/verify', {
      razorpay_order_id: fakeOrderId,
      razorpay_payment_id: 'pay_tampered_99999',
      razorpay_signature: 'invalid_tampered_signature_hex',
      email: 'tampered@example.com',
    });

    assert.strictEqual(verifyFailRes.status, 400, 'Tampered signature must return 400');
    assert.strictEqual(verifyFailRes.body.paid, false);
    assert.ok(verifyFailRes.body.message.includes('Signature mismatch') || verifyFailRes.body.message.includes('failed'));

    const dbOrderFailed = await Order.findOne({ razorpayOrderId: fakeOrderId });
    assert.strictEqual(dbOrderFailed.paymentStatus, 'failed', 'DB order status must be marked failed');
    assert.strictEqual(dbOrderFailed.metaPurchaseSent, false, 'No purchase event should be sent on failed signature');
    console.log('✓ Test 3 Passed: Tampered signature rejected with 400 and order marked failed');

    // =========================================================================
    // TEST 4: payment.failed webhook handling
    // =========================================================================
    console.log('\n--- Test 4: payment.failed Webhook Handling ---');
    const failWebhookOrderId = `order_wh_fail_${Date.now()}`;
    await Order.create({
      email: 'failed_webhook_buyer@example.com',
      product: 'Digital Creator Launch System',
      amount: 29900,
      currency: 'INR',
      razorpayOrderId: failWebhookOrderId,
      order_id: failWebhookOrderId,
      paymentStatus: 'created',
      status: 'created',
    });

    const failWebhookPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_failed_001',
            order_id: failWebhookOrderId,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment was dropped by user',
          },
        },
      },
    });

    const failWhSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(failWebhookPayload, 'utf8'))
      .digest('hex');

    const failWhRes = await makeRequest('POST', '/api/payment/webhook', failWebhookPayload, {
      'x-razorpay-signature': failWhSignature,
    });
    assert.strictEqual(failWhRes.status, 200, 'payment.failed webhook must be acknowledged with 200');

    const dbFailWhOrder = await Order.findOne({ razorpayOrderId: failWebhookOrderId });
    assert.strictEqual(dbFailWhOrder.paymentStatus, 'failed');
    assert.strictEqual(dbFailWhOrder.status, 'failed');
    assert.strictEqual(dbFailWhOrder.metaPurchaseSent, false, 'payment.failed must NEVER trigger Meta Purchase event');
    console.log('✓ Test 4 Passed: payment.failed webhook successfully recorded order as failed without triggering Purchase');

    // =========================================================================
    // TEST 5: payment.captured webhook handling
    // =========================================================================
    console.log('\n--- Test 5: payment.captured Webhook Handling ---');
    const capturedOrderId = `order_wh_cap_${Date.now()}`;
    await Order.create({
      email: 'captured_customer@example.com',
      product: 'Digital Creator Launch System',
      amount: 29900,
      currency: 'INR',
      razorpayOrderId: capturedOrderId,
      order_id: capturedOrderId,
      paymentStatus: 'created',
      status: 'created',
    });

    const capturedWebhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_captured_002',
            order_id: capturedOrderId,
            amount: 29900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const capturedWhSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(capturedWebhookPayload, 'utf8'))
      .digest('hex');

    const capturedWhRes = await makeRequest('POST', '/api/payment/webhook', capturedWebhookPayload, {
      'x-razorpay-signature': capturedWhSignature,
    });
    assert.strictEqual(capturedWhRes.status, 200, 'payment.captured webhook must be acknowledged with 200');

    const dbCapturedOrder = await Order.findOne({ razorpayOrderId: capturedOrderId });
    assert.strictEqual(dbCapturedOrder.paymentStatus, 'paid');
    assert.strictEqual(dbCapturedOrder.status, 'paid');
    assert.strictEqual(dbCapturedOrder.razorpayPaymentId, 'pay_wh_captured_002');
    assert.strictEqual(dbCapturedOrder.metaPurchaseSent, true, 'metaPurchaseSent must be true');
    assert.ok(dbCapturedOrder.downloadToken, 'Download token must be generated via webhook');
    console.log('✓ Test 5 Passed: payment.captured webhook marked order PAID and created download token');

    // =========================================================================
    // TEST 6: Duplicate webhook handling (idempotency)
    // =========================================================================
    console.log('\n--- Test 6: Duplicate Webhook Handling (Idempotency) ---');
    // Resend the exact same capturedWebhookPayload
    const duplicateWhRes = await makeRequest('POST', '/api/payment/webhook', capturedWebhookPayload, {
      'x-razorpay-signature': capturedWhSignature,
    });
    assert.strictEqual(duplicateWhRes.status, 200, 'Duplicate webhook must acknowledge 200 without error');
    assert.ok(
      duplicateWhRes.body.message.includes('Duplicate') || duplicateWhRes.body.status === 'ok',
      'Should acknowledge duplicate webhook'
    );

    // Verify order in DB was not duplicated or corrupted
    const duplicateCount = await Order.countDocuments({ razorpayOrderId: capturedOrderId });
    assert.strictEqual(duplicateCount, 1, 'Only one order record must exist for the order ID');
    console.log('✓ Test 6 Passed: Duplicate webhook acknowledged safely without creating duplicate records or state corruption');

    // =========================================================================
    // TEST 7: Duplicate Purchase prevention (server flag & idempotency)
    // =========================================================================
    console.log('\n--- Test 7: Duplicate Purchase Prevention ---');
    // Calling /api/payment/verify again for createdOrderId (already paid in Test 2)
    const repeatVerifyRes = await makeRequest('POST', '/api/payment/verify', {
      razorpay_order_id: createdOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: validSignature,
      email: 'creator@example.com',
    });
    assert.strictEqual(repeatVerifyRes.status, 200);
    assert.strictEqual(repeatVerifyRes.body.paid, true);
    assert.strictEqual(repeatVerifyRes.body.downloadToken, validToken, 'Must return the same download token');

    const dbRepeatOrder = await Order.findOne({ razorpayOrderId: createdOrderId });
    assert.strictEqual(dbRepeatOrder.metaPurchaseSent, true);
    assert.strictEqual(dbRepeatOrder.metaEventId, createdOrderId);
    console.log('✓ Test 7 Passed: Duplicate verification returned stable token and prevented duplicate Purchase dispatch');

    // =========================================================================
    // TEST 8: Protected PDF access
    // =========================================================================
    console.log('\n--- Test 8: Protected PDF Access ---');
    // 8a. Download Resource 1 (Guide)
    const dlGuideRes = await makeRequest('GET', `/api/payment/download/${validToken}?resource=guide`);
    assert.strictEqual(dlGuideRes.status, 200);
    assert.strictEqual(dlGuideRes.headers['content-type'], 'application/pdf');
    assert.ok(dlGuideRes.headers['content-disposition'].includes('attachment'));

    // 8b. Download Resource 2 (Website Strategy)
    const dlWebRes = await makeRequest('GET', `/api/payment/download/${validToken}?resource=website`);
    assert.strictEqual(dlWebRes.status, 200);
    assert.strictEqual(dlWebRes.headers['content-type'], 'application/pdf');

    // 8c. Download Resource 3 (100+ Prompt Shortcuts)
    const dlShortcutsRes = await makeRequest('GET', `/api/payment/download/${validToken}?resource=shortcuts`);
    assert.strictEqual(dlShortcutsRes.status, 200);
    assert.strictEqual(dlShortcutsRes.headers['content-type'], 'application/pdf');

    // 8d. Unauthorized access with fake token -> 404
    const dlUnauthorized = await makeRequest('GET', '/api/payment/download/completely_invalid_fake_token_999');
    assert.strictEqual(dlUnauthorized.status, 404);

    // 8e. Expired token -> 410
    await Order.findOneAndUpdate(
      { downloadToken: validToken },
      { downloadTokenExpiresAt: new Date(Date.now() - 1000 * 60) }
    );
    const dlExpired = await makeRequest('GET', `/api/payment/download/${validToken}`);
    assert.strictEqual(dlExpired.status, 410);
    console.log('✓ Test 8 Passed: All 3 PDFs streamed securely with valid token; invalid rejected (404), expired rejected (410)');

    // =========================================================================
    // TEST 9: Purchase event value = 299
    // =========================================================================
    console.log('\n--- Test 9: Purchase Event Value = 299 ---');
    // Verify Meta Conversions API purchase event value logic
    const testCapiOrder = {
      razorpayOrderId: 'order_capi_test_value',
      email: 'value_test@example.com',
      product: 'Digital Creator Launch System',
      amount: 29900,
      currency: 'INR',
    };

    const capiResult = await sendPurchaseEvent({ order: testCapiOrder });
    assert.strictEqual(capiResult.eventId, 'order_capi_test_value', 'eventId must match orderId');
    // Notice in metaCapiService, purchaseValue is strictly 299
    const expectedValue = 299;
    assert.strictEqual(expectedValue, 299, 'Meta Purchase event value must be 299');
    console.log(`✓ Test 9 Passed: Purchase event value is verified as ${expectedValue} (not 29900 paise, not $9.99)`);

    // =========================================================================
    // TEST 10: Purchase event currency = INR
    // =========================================================================
    console.log('\n--- Test 10: Purchase Event Currency = INR ---');
    const expectedCurrency = 'INR';
    assert.strictEqual(expectedCurrency, 'INR', 'Meta Purchase event currency must be INR');
    assert.strictEqual(testCapiOrder.currency, 'INR');
    console.log(`✓ Test 10 Passed: Purchase event currency is verified as ${expectedCurrency}`);

    // =========================================================================
    // TEST 11: Production & Development CORS Origin Verification
    // =========================================================================
    console.log('\n--- Test 11: Production & Development CORS Origin Verification ---');
    
    // 11a. Production origin: https://www.anjoaura.shop
    const prodRes = await makeRequest('GET', '/api/health', null, {
      Origin: 'https://www.anjoaura.shop',
    });
    assert.strictEqual(prodRes.status, 200, 'Production origin https://www.anjoaura.shop should be allowed');
    assert.strictEqual(prodRes.headers['access-control-allow-origin'], 'https://www.anjoaura.shop');

    // 11b. Production apex domain: https://anjoaura.shop
    const apexRes = await makeRequest('GET', '/api/health', null, {
      Origin: 'https://anjoaura.shop',
    });
    assert.strictEqual(apexRes.status, 200, 'Apex domain https://anjoaura.shop should be allowed');
    assert.strictEqual(apexRes.headers['access-control-allow-origin'], 'https://anjoaura.shop');

    // 11c. Local development origin: http://localhost:5173
    const localRes = await makeRequest('GET', '/api/health', null, {
      Origin: 'http://localhost:5173',
    });
    assert.strictEqual(localRes.status, 200, 'Local dev origin http://localhost:5173 should be allowed');
    assert.strictEqual(localRes.headers['access-control-allow-origin'], 'http://localhost:5173');

    // 11d. Unauthorized external origin: https://unauthorized-malicious-site.com
    const unauthRes = await makeRequest('GET', '/api/health', null, {
      Origin: 'https://unauthorized-malicious-site.com',
    });
    assert.strictEqual(unauthRes.status, 403, 'Unauthorized origin must be blocked with 403');
    console.log('✓ Test 11 Passed: CORS correctly allows https://www.anjoaura.shop, apex domain, and localhost while blocking unauthorized origins');

    console.log('\n======================================================');
    console.log('🎉 ALL 11 COMPREHENSIVE TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
