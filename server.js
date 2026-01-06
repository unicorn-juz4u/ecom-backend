const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Route 1: Create an Order
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // amount in paise
            currency: "INR",
            receipt: "receipt_order_123",
        };

        const order = await razorpay.orders.create(options);
        res.json(order); // Returns the order_id
    } catch (error) {
        res.status(500).send(error);
    }
});

// Route 2: Verify Payment Signature
app.post('/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        return res.status(200).json({ message: "Payment verified successfully" });
    } else {
        return res.status(400).json({ message: "Invalid signature sent!" });
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));