const path = require('path');
const fs = require('fs');
const Order = require('../models/Order');
const { getRazorpayKeyId, getRazorpayKeySecret, getWebhookSecret } = require('../config/razorpay');
const { createRazorpayOrder } = require('../services/razorpayService');
const { validateEmail } = require('../utils/validation');
const {
  verifyPaymentSignature,
  verifyWebhookSignature,
  generateDownloadToken,
} = require('../utils/paymentVerification');
const { sendPurchaseEvent } = require('../services/metaCapiService');

/**
 * Helper to get configured product details
 */
function getProductConfig() {
  const price = parseInt(process.env.PRODUCT_PRICE || '29900', 10);
  const name = process.env.PRODUCT_NAME || 'Digital Creator Launch System';
  const currency = process.env.PRODUCT_CURRENCY || 'INR';
  return { price, name, currency };
}

/**
 * Helper to build the secure bundle delivery response
 */
function createDeliveryPayload(order, token) {
  const backendBase = (
    process.env.BACKEND_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://ecom-wmqw.onrender.com' : 'http://localhost:5000')
  ).replace(/\/+$/, '');

  return {
    success: true,
    paid: true,
    message: 'Payment verified successfully. Your complete 3-resource toolkit is ready.',
    orderId: order.razorpayOrderId,
    customerEmail: order.email,
    downloadToken: token,
    expiresAt: order.downloadTokenExpiresAt,
    resources: {
      guide: {
        id: 'guide',
        title: 'Problem Solving & Digital Monetization Guide',
        description: 'Identify problems, shape digital opportunities, and think through monetization.',
        downloadUrl: `/api/payment/download/${token}?resource=guide`,
        fullDownloadUrl: `${backendBase}/api/payment/download/${token}?resource=guide`,
        filename: 'Persistent-Problems-Practical-Solutions.pdf',
        type: 'download',
      },
      website: {
        id: 'website',
        title: 'Antigravity + Claude Interactive Website Build Guide',
        description: 'A practical guide for turning an idea into an interactive website using AI-assisted development.',
        downloadUrl: `/api/payment/download/${token}?resource=website`,
        fullDownloadUrl: `${backendBase}/api/payment/download/${token}?resource=website`,
        filename: 'Website-Development-Strategy.pdf',
        type: 'download',
      },
      shortcuts: {
        id: 'shortcuts',
        title: '100+ Visual Prompt Shortcuts',
        description: 'Ready-to-use visual prompt shortcuts for product shots, ads, website visuals, mockups, carousels, thumbnails and more.',
        downloadUrl: `/api/payment/download/${token}?resource=shortcuts`,
        fullDownloadUrl: `${backendBase}/api/payment/download/${token}?resource=shortcuts`,
        filename: '100-Image-Prompt-Shortcuts.pdf',
        type: 'download',
      },
    },
    // Backwards compatibility field
    pdfUrl: `/api/payment/download/${token}?resource=guide`,
    fullPdfUrl: `${backendBase}/api/payment/download/${token}?resource=guide`,
    pdfName: 'Persistent-Problems-Practical-Solutions.pdf',
  };
}

/**
 * POST /api/payment/create-order
 * Initiates Razorpay Order server-side
 */
async function createOrder(req, res, next) {
  try {
    const { email } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error,
      });
    }

    const customerEmail = emailValidation.email;
    const { price, name, currency } = getProductConfig();

    const receipt = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create order via Razorpay Service
    const rzpOrder = await createRazorpayOrder({
      amount: price,
      currency,
      receipt,
      notes: {
        product: name,
        email: customerEmail,
      },
    });

    // Persist Order in MongoDB
    try {
      await Order.create({
        email: customerEmail,
        product: name,
        amount: price,
        currency,
        razorpayOrderId: rzpOrder.id,
        order_id: rzpOrder.id,
        paymentStatus: 'created',
        status: 'created',
      });
    } catch (dbError) {
      console.error('[DB Order Create Warning]:', dbError.message);
    }

    const publicRazorpayKey = getRazorpayKeyId();

    return res.status(200).json({
      success: true,
      orderId: rzpOrder.id,
      amount: price,
      currency,
      keyId: publicRazorpayKey,
      productName: name,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/payment/verify
 * Cryptographic server-side payment signature verification
 */
async function verifyPayment(req, res, next) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email,
      fbp,
      fbc,
      eventSourceUrl,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        paid: false,
        message: 'Missing required Razorpay payment verification parameters',
      });
    }

    const keySecret = getRazorpayKeySecret();
    const isSignatureValid = verifyPaymentSignature(
      {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      keySecret
    );

    if (!isSignatureValid) {
      console.warn(`[Payment Fraud/Tamper Alert] Invalid signature for order: ${razorpay_order_id}`);

      // Update order status if found
      await Order.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { paymentStatus: 'failed', status: 'failed' }
      ).catch(() => {});

      return res.status(400).json({
        success: false,
        paid: false,
        message: 'Payment verification failed. Signature mismatch.',
      });
    }

    // Payment signature is verified legitimate!
    const { name, price, currency } = getProductConfig();
    const expiryHours = parseInt(process.env.DOWNLOAD_TOKEN_EXPIRY_HOURS || '24', 10);

    // Extract client IP and user agent for attribution & fraud detection
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip;
    const userAgent = req.headers['user-agent'] || '';

    let order = await Order.findOne({ razorpayOrderId: razorpay_order_id });

    // Idempotency check: if order was already processed as paid
    if (order && (order.paymentStatus === 'paid' || order.status === 'paid')) {
      let token = order.downloadToken;
      const isExpired = order.downloadTokenExpiresAt && new Date() > order.downloadTokenExpiresAt;
      if (!token || isExpired) {
        token = generateDownloadToken();
        order.downloadToken = token;
        order.downloadTokenExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
      }

      // Check if Meta Conversions API purchase event was dispatched
      if (!order.metaPurchaseSent) {
        await sendPurchaseEvent({
          order,
          clientIp,
          userAgent,
          fbp: fbp || order.fbp,
          fbc: fbc || order.fbc,
          eventSourceUrl,
        });
        order.metaPurchaseSent = true;
        order.metaEventId = order.razorpayOrderId;
      }

      await order.save();
      return res.status(200).json(createDeliveryPayload(order, token));
    }

    if (!order) {
      order = new Order({
        email: email ? email.toLowerCase().trim() : 'customer@example.com',
        product: name,
        amount: price,
        currency,
        razorpayOrderId: razorpay_order_id,
        order_id: razorpay_order_id,
      });
    }

    const downloadToken = generateDownloadToken();
    order.razorpayPaymentId = razorpay_payment_id;
    order.payment_id = razorpay_payment_id;
    order.order_id = razorpay_order_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentStatus = 'paid';
    order.status = 'paid';
    order.paidAt = new Date();
    order.downloadToken = downloadToken;
    order.downloadTokenExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    if (email) {
      order.email = email.toLowerCase().trim();
    }
    if (fbp) order.fbp = fbp;
    if (fbc) order.fbc = fbc;
    if (clientIp) order.clientIp = clientIp;
    if (userAgent) order.clientUserAgent = userAgent;

    // Send Meta Conversions API Purchase event strictly after verified payment
    if (!order.metaPurchaseSent) {
      await sendPurchaseEvent({
        order,
        clientIp,
        userAgent,
        fbp,
        fbc,
        eventSourceUrl,
      });
      order.metaPurchaseSent = true;
      order.metaEventId = razorpay_order_id;
    }

    await order.save();

    console.log(`[Payment Verified]: Order ${razorpay_order_id} marked PAID for ${order.email} (token generated)`);

    return res.status(200).json(createDeliveryPayload(order, downloadToken));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/payment/download/:token
 * Secure, tokenized digital asset download endpoint
 */
async function downloadAsset(req, res, next) {
  try {
    const { token } = req.params;
    const resource = (req.query.resource || 'guide').toLowerCase().trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Download token is required',
      });
    }

    const order = await Order.findOne({
      downloadToken: token,
      paymentStatus: 'paid',
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or unauthorized download link.',
      });
    }

    // Check expiration
    if (order.downloadTokenExpiresAt && new Date() > order.downloadTokenExpiresAt) {
      return res.status(410).json({
        success: false,
        message: 'This download link has expired. Please contact support@anjoaura.com for a refreshed link.',
      });
    }

    // Check maximum downloads limit
    if (order.downloadCount >= (order.maxDownloads || 15)) {
      return res.status(403).json({
        success: false,
        message: 'Download limit reached for this token. Please contact support@anjoaura.com if you need additional access.',
      });
    }

    let filePath = '';
    let downloadFilename = '';

    if (resource === 'shortcuts' || resource === 'prompts') {
      filePath = path.join(__dirname, '..', 'uploads', '100_Plus_Image_Prompt_Shortcuts.pdf');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', 'uploads', '100-Image-Prompt-Shortcuts.pdf');
      }
      downloadFilename = '100-Image-Prompt-Shortcuts.pdf';
    } else if (resource === 'website' || resource === 'strategy') {
      filePath = path.join(__dirname, '..', 'uploads', 'Website_Development_Strategy.pdf');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', 'uploads', '🚀 How to Build an Interactive Website (Step-by-Step Guide).pdf');
      }
      downloadFilename = 'Website-Development-Strategy.pdf';
    } else {
      filePath = path.join(__dirname, '..', 'uploads', 'Persistent_Problems_Practical_Solutions.pdf');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', 'uploads', 'product.pdf');
      }
      downloadFilename = 'Persistent-Problems-Practical-Solutions.pdf';
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[Download Error] Requested asset file not found on disk: ${filePath}`);
      return res.status(500).json({
        success: false,
        message: 'Digital asset temporarily unavailable. Support has been notified.',
      });
    }

    // Increment download counter safely
    order.downloadCount = (order.downloadCount || 0) + 1;
    await order.save().catch((dbErr) => {
      console.error('[DB Download Count Update Warning]:', dbErr.message);
    });

    // Stream the binary PDF with strict security headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (err) => {
      console.error('[PDF Stream Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to stream digital asset' });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/payment/status/:orderId
 * Returns current server-side payment status
 */
async function getOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required',
      });
    }

    const order = await Order.findOne({ razorpayOrderId: orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        status: 'unknown',
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      success: true,
      order_id: order.razorpayOrderId,
      payment_id: order.razorpayPaymentId || null,
      orderId: order.razorpayOrderId,
      status: order.paymentStatus,
      paymentStatus: order.paymentStatus,
      amount: order.amount,
      currency: order.currency,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      created_at: order.createdAt,
      metaPurchaseSent: order.metaPurchaseSent || false,
      metaEventId: order.metaEventId || null,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/payment/webhook
 * Razorpay Webhook Handler
 * Supports: payment.captured, order.paid, payment.failed
 */
async function handleWebhook(req, res, next) {
  try {
    const webhookSecret = getWebhookSecret();
    const signature = req.headers['x-razorpay-signature'];

    // Verify cryptographic webhook signature when secret is configured
    if (webhookSecret) {
      if (!signature) {
        return res.status(400).json({ status: 'error', message: 'Missing webhook signature header' });
      }

      const isValid = verifyWebhookSignature(req.rawBody, signature, webhookSecret);
      if (!isValid) {
        console.warn('[Webhook Fraud Alert] Invalid webhook signature detected');
        return res.status(400).json({ status: 'error', message: 'Invalid webhook signature' });
      }
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    console.log(`[Webhook Event Received]: ${event}`);

    // 1. Support payment.failed
    if (event === 'payment.failed') {
      const paymentEntity = payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const order = await Order.findOne({ razorpayOrderId: orderId });
        if (order && order.paymentStatus !== 'paid') {
          order.paymentStatus = 'failed';
          order.status = 'failed';
          if (paymentId) {
            order.razorpayPaymentId = paymentId;
            order.payment_id = paymentId;
          }
          await order.save();
          console.log(`[Webhook]: Order ${orderId} marked FAILED via payment.failed`);
        }
      }
      return res.status(200).json({ status: 'ok', event, message: 'payment.failed handled' });
    }

    // 2. Support payment.captured or order.paid
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        let order = await Order.findOne({ razorpayOrderId: orderId });

        if (order) {
          // Idempotency check: if order was already paid, do not duplicate actions or CAPI event
          if (order.paymentStatus === 'paid' || order.status === 'paid') {
            console.log(`[Webhook Idempotency]: Order ${orderId} already marked PAID. Duplicate ignored.`);
            return res.status(200).json({
              status: 'ok',
              event,
              message: 'Duplicate webhook handled, order already paid',
            });
          }

          const expiryHours = parseInt(process.env.DOWNLOAD_TOKEN_EXPIRY_HOURS || '24', 10);
          order.paymentStatus = 'paid';
          order.status = 'paid';
          order.paidAt = new Date();
          if (paymentId) {
            order.razorpayPaymentId = paymentId;
            order.payment_id = paymentId;
          }
          if (!order.downloadToken) {
            order.downloadToken = generateDownloadToken();
            order.downloadTokenExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
          }

          // Trigger Meta Conversions API Purchase event strictly if not already dispatched
          if (!order.metaPurchaseSent) {
            await sendPurchaseEvent({ order });
            order.metaPurchaseSent = true;
            order.metaEventId = orderId;
          }

          await order.save();
          console.log(`[Webhook Confirmed]: Order ${orderId} marked PAID via ${event}`);
        }
      }
      return res.status(200).json({ status: 'ok', event, message: `${event} processed` });
    }

    // Acknowledge other unhandled Razorpay events cleanly
    return res.status(200).json({ status: 'ok', message: `Unhandled event ${event} acknowledged` });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  getOrderStatus,
  handleWebhook,
  downloadAsset,
};
