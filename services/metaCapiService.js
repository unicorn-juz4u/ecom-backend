const crypto = require('crypto');

/**
 * Normalizes and hashes a string using SHA-256 per Meta Conversions API specifications.
 * @param {string} value
 * @returns {string|null}
 */
function hashSha256(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Checks if Meta Conversions API credentials are fully configured.
 * @returns {boolean}
 */
function isCapiConfigured() {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  return Boolean(
    pixelId &&
    accessToken &&
    !pixelId.includes('placeholder') &&
    !accessToken.includes('placeholder')
  );
}

/**
 * Sends a server-side Purchase event to Meta Conversions API.
 * Deduplicates automatically against browser Meta Pixel via matching `event_id`.
 *
 * @param {Object} params
 * @param {Object} params.order - MongoDB Order document
 * @param {string} [params.clientIp] - Client IPv4 / IPv6 address
 * @param {string} [params.userAgent] - Client User-Agent header
 * @param {string} [params.fbp] - _fbp Facebook browser cookie
 * @param {string} [params.fbc] - _fbc Facebook click cookie
 * @param {string} [params.eventSourceUrl] - URL of the purchase page
 * @returns {Promise<{ success: boolean, configured: boolean, data?: any, error?: string }>}
 */
async function sendPurchaseEvent({
  order,
  clientIp,
  userAgent,
  fbp,
  fbc,
  eventSourceUrl,
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  // The event_id matches the client-side Pixel eventID for Meta automatic deduplication
  const eventId = order.razorpayOrderId || order.order_id;
  const eventTime = Math.floor(Date.now() / 1000);
  const purchaseValue = 299; // ₹299 INR
  const currency = 'INR';

  if (!isCapiConfigured()) {
    console.log(
      `[Meta CAPI] Notice: Server-side Conversions API is not yet configured (META_PIXEL_ID or META_ACCESS_TOKEN missing). Pixel eventID=${eventId} will rely on browser tracking.`
    );
    return {
      success: false,
      configured: false,
      reason: 'unconfigured',
      eventId,
    };
  }

  try {
    const hashedEmail = hashSha256(order.email);
    const userData = {
      client_ip_address: clientIp || undefined,
      client_user_agent: userAgent || undefined,
      fbp: fbp || order.fbp || undefined,
      fbc: fbc || order.fbc || undefined,
    };

    if (hashedEmail) {
      userData.em = [hashedEmail];
    }

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          event_id: eventId,
          event_source_url:
            eventSourceUrl ||
            (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/+$/, '') : null) ||
            (process.env.NODE_ENV === 'production' ? 'https://www.anjoaura.shop' : 'http://localhost:5173'),
          action_source: 'website',
          user_data: userData,
          custom_data: {
            value: purchaseValue,
            currency: currency,
            content_name: order.product || 'Digital Creator Launch System',
            order_id: eventId,
            num_items: 1,
          },
        },
      ],
    };

    if (testEventCode && !testEventCode.includes('placeholder')) {
      payload.test_event_code = testEventCode;
    }

    const endpoint = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(
      accessToken
    )}`;

    console.log(`[Meta CAPI] Dispatching server Purchase event for order ${eventId}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.warn(
        `[Meta CAPI Warning] Meta API returned HTTP ${response.status}:`,
        responseData
      );
      return {
        success: false,
        configured: true,
        error: responseData.error?.message || 'Meta CAPI request failed',
        data: responseData,
      };
    }

    console.log(
      `[Meta CAPI Success] Server Purchase event acknowledged by Meta for order ${eventId}. Events received: ${responseData.events_received}`
    );

    return {
      success: true,
      configured: true,
      data: responseData,
      eventId,
    };
  } catch (error) {
    console.error(`[Meta CAPI Error] Failed to send Purchase event:`, error.message);
    return {
      success: false,
      configured: true,
      error: error.message,
    };
  }
}

module.exports = {
  isCapiConfigured,
  hashSha256,
  sendPurchaseEvent,
};
