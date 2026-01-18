const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    category: String,
    imageUrl: String,
    stock: { type: Number, default: 0 },
    affiliateLink: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);

// const mongoose = require('mongoose');

// const productSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     description: { type: String, required: true },
//     price: { type: Number, required: true },
//     category: { type: String, required: true },
//     notes: { type: String }, // e.g., "Top: Bergamot, Base: Musk"
//     images: [{ type: String }],
//     stock: { type: Number, default: 0 },
//     batchInfo: { type: String }, // "Imported Jan 2026"
//     isFeatured: { type: Boolean, default: false }
// }, { timestamps: true });

// module.exports = mongoose.model('Product', productSchema);