const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    product: {
      type: String,
      required: true,
      default: 'Digital Creator Launch System',
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      sparse: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
    },
    paymentStatus: {
      type: String,
      enum: ['created', 'paid', 'failed', 'cancelled', 'unknown'],
      default: 'created',
      index: true,
    },
    paidAt: {
      type: Date,
    },
    downloadToken: {
      type: String,
      sparse: true,
      index: true,
    },
    downloadTokenExpiresAt: {
      type: Date,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    maxDownloads: {
      type: Number,
      default: 15,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Standard purchase record fields
    order_id: {
      type: String,
      index: true,
    },
    payment_id: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      index: true,
    },
    // Meta Ads tracking & deduplication fields
    metaPurchaseSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    metaEventId: {
      type: String,
      index: true,
    },
    fbp: {
      type: String,
    },
    fbc: {
      type: String,
    },
    clientIp: {
      type: String,
    },
    clientUserAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias for created_at
orderSchema.virtual('created_at').get(function () {
  return this.createdAt;
});

// Pre-save hook to ensure standard order record fields are consistently populated
orderSchema.pre('save', function (next) {
  if (this.razorpayOrderId && !this.order_id) {
    this.order_id = this.razorpayOrderId;
  }
  if (this.razorpayPaymentId && !this.payment_id) {
    this.payment_id = this.razorpayPaymentId;
  }
  if (this.paymentStatus) {
    this.status = this.paymentStatus;
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
