# Digital Product Payment & Delivery Backend (Razorpay + Express + MongoDB)

Production-ready, secure payment verification and digital PDF delivery system for the **"MAKE YOUR FIRST $100 ONLINE"** beginner guide. Built with Node.js, Express (CommonJS), MongoDB Atlas, and the official Razorpay Node.js SDK.

---

## Architecture Overview

```
CUSTOMER
   ↓
VITE SALES PAGE (http://localhost:5173)
   ↓
ENTER EMAIL & CLICK CTA ("Get the PDF — ₹99")
   ↓
BACKEND POST /api/payment/create-order
   ↓ (Server-enforces ₹99 / 9900 paise, saves Order in MongoDB)
RAZORPAY CHECKOUT MODAL (UPI, Cards, NetBanking, Wallets)
   ↓
CUSTOMER COMPLETES PAYMENT
   ↓
FRONTEND RECEIVES RAZORPAY RESPONSE
   ↓
BACKEND POST /api/payment/verify
   ↓ (Verifies HMAC-SHA256 signature using RAZORPAY_KEY_SECRET)
ORDER MARKED AS PAID IN MONGODB
   ↓
CRYPTOGRAPHICALLY RANDOM DOWNLOAD TOKEN GENERATED (24h expiry)
   ↓
EMAIL SERVICE SENDS RECEIPT & DOWNLOAD LINK TO CUSTOMER
   ↓
FRONTEND DISPLAYS "Payment successful 🎉" + DIRECT DOWNLOAD BUTTON
   ↓
CUSTOMER DOWNLOADS PDF via GET /api/payment/download/:token
   ↓ (Validates token, expiry, and paid status before streaming PDF)
```

---

## 1. Project Directory Structure

```
backend/
├── config/
│   ├── db.js                 # MongoDB Atlas connection manager (Mongoose)
│   └── razorpay.js           # Razorpay SDK initialization & key helpers
├── controllers/
│   └── paymentController.js  # Order creation, signature verification, status, webhook, & PDF streaming
├── middleware/
│   └── errorHandler.js       # Centralized error handler (prevents secret/stack trace leaks)
├── models/
│   └── Order.js              # Mongoose Order schema (status, paymentId, deliveryStatus, tokens)
├── routes/
│   └── paymentRoutes.js      # REST API route declarations
├── services/
│   └── razorpayService.js    # Razorpay SDK order & payment interactions
├── test/
│   └── payment.test.js       # Automated end-to-end test suite
├── uploads/
│   └── product.pdf           # Secure digital product PDF (not publicly exposed)
├── utils/
│   ├── paymentVerification.js# Constant-time HMAC-SHA256 & crypto token generators
│   └── validation.js         # Email normalization and validation
├── .env                      # Local environment variables (do NOT commit)
├── .env.example              # Template environment variables
├── .gitignore                # Git ignore for node_modules, .env, uploads/private/, logs/
├── index.js                  # Express entry point (Helmet, CORS, Rate Limit, RawBody)
├── package.json              # Backend dependencies & npm scripts
└── README.md                 # Complete documentation & setup instructions
```

---

## 2. Environment Variables Setup

### Backend (`backend/.env`)

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000

# Razorpay Credentials (from Razorpay Dashboard > Settings > API Keys)
RAZORPAY_KEY_ID=rzp_test_YOUR_TEST_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET

# Digital Product Configuration
PRODUCT_PRICE=9900
PRODUCT_NAME=MAKE YOUR FIRST $100 ONLINE - Beginner's PDF Guide
PRODUCT_CURRENCY=INR
DOWNLOAD_TOKEN_EXPIRY_HOURS=24

# MongoDB Database Connection String
MONGODB_URI=mongodb+srv://unicornjuz4u_db_user:unicornjuz4u_db_user@koreanperfumecluster.kwcpln6.mongodb.net/digital_product_store?appName=koreanPerfumeCluster&retryWrites=true&w=majority

# Email (SMTP) Configuration
EMAIL_FROM="First $100 Online" <noreply@yourdomain.com>
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
```

### Frontend (`../anjoaura/.env`)

```env
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=rzp_test_YOUR_TEST_KEY_ID
```

> **Security Rule:** Never put `RAZORPAY_KEY_SECRET` in the frontend `.env` or Vite code. Only the public `RAZORPAY_KEY_ID` may be exposed to the browser.

---

## 3. Quick Start (Local Development)

### Prerequisites
- Node.js v18+
- npm v9+

### Running the Backend

```bash
cd backend
npm install
npm run dev
```
The backend server runs on `http://localhost:5000`.

### Running the Frontend

```bash
cd ../anjoaura
npm install
npm run dev
```
The frontend runs on `http://localhost:5173`.

---

## 4. Running Automated Tests

A comprehensive automated test suite verifies all critical paths:

```bash
cd backend
npm test
```

Tests verify:
- ✅ Customer email validation and normalization
- ✅ Server-side price enforcement (client cannot manipulate amount)
- ✅ Constant-time HMAC-SHA256 payment signature verification
- ✅ Rejecting tampered / forged signatures with 400 Bad Request
- ✅ Idempotent payment verification (duplicate calls do not duplicate orders or tokens)
- ✅ Webhook signature verification with raw request body buffer
- ✅ Secure token PDF streaming with `application/pdf` headers
- ✅ Rejecting expired tokens (410 Gone)
- ✅ Rejecting invalid tokens (404 Not Found)
- ✅ Rejecting unpaid orders attempting download (403 Forbidden)

---

## 5. Razorpay Configuration & Webhook Setup

### 1. Generating Razorpay API Keys
1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Account & Settings** → **API Keys**.
3. Under **Test Mode**, click **Generate Key**.
4. Copy the **Key Id** and **Key Secret**.
5. Put the **Key Id** in both `backend/.env` and `frontend/.env`.
6. Put the **Key Secret** ONLY in `backend/.env`.

### 2. Configuring the Webhook in Razorpay
Razorpay webhooks provide server-to-server confirmation when payments are captured:
1. In Razorpay Dashboard, navigate to **Account & Settings** → **Webhooks**.
2. Click **Add New Webhook**.
3. **Webhook URL**:
   - For local development: Use ngrok or localtunnel: `https://<your-ngrok-subdomain>.ngrok-free.app/api/payment/webhook`
   - For production: `https://api.yourdomain.com/api/payment/webhook`
4. **Secret**: Enter a secure random string and set it as `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`.
5. **Active Events**: Select:
   - `payment.captured`
   - `order.paid`
6. Click **Save**.

---

## 6. Switching from Razorpay TEST Mode to LIVE Mode

When you are ready to accept real payments:

1. **Complete Razorpay KYC Verification** in your Razorpay Dashboard.
2. In Razorpay Dashboard, toggle the switch from **Test Mode** to **Live Mode**.
3. Go to **Account & Settings** → **API Keys** in Live Mode.
4. Click **Generate Live Key**.
5. Update your production environment variables:
   - `RAZORPAY_KEY_ID`: `rzp_live_xxxxxxxxxxxx`
   - `RAZORPAY_KEY_SECRET`: `your_live_secret`
6. Update the live webhook secret in Razorpay Dashboard and in your backend environment variables.
7. Restart the backend and frontend.

---

## 7. Direct PDF Delivery

Once payment is verified server-side via HMAC-SHA256 signature validation, the backend returns the direct download path:
- The PDF guide is hosted at: `anjoaura/public/pdf/product-guide.pdf`
- Frontend serves it at: `/pdf/product-guide.pdf`
- The customer immediately sees the success confirmation and "Download Your PDF" button upon successful verification.

---

## 8. Security Highlights

- **Server-Authoritative Pricing**: The client cannot specify or alter the price. The ₹99 price (9900 paise) is strictly configured and enforced server-side.
- **Constant-Time Verification**: Payment and webhook signatures are compared using `crypto.timingSafeEqual` to prevent timing attacks.
- **Raw-Body Webhook Capture**: Express is configured with `verify: (req, res, buf) => { req.rawBody = buf; }` to ensure HMAC validation matches the exact bytes sent by Razorpay.
- **Rate Limiting & Helmet**: Protects against brute-force attacks and cross-site scripting headers.
- **CORS Protection**: Restricted to `FRONTEND_URL`.

---

## 9. API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check & service status |
| `POST` | `/api/payment/create-order` | Validates email & creates Razorpay order |
| `POST` | `/api/payment/verify` | Cryptographically verifies Razorpay HMAC signature & confirms payment |
| `GET` | `/api/payment/status/:orderId` | Checks server-side payment status |
| `POST` | `/api/payment/webhook` | Raw-body Razorpay webhook receiver |
