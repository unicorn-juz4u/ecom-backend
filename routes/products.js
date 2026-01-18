const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../config/cloudinary');

// GET all products - Public
router.get('/', productController.getAllProducts);

// GET single product - Public
router.get('/:id', productController.getProductById);

// CREATE a product - Admin only
router.post(
    '/',
    protect,
    authorize('admin'),
    upload.single('image'),
    productController.createProduct
);

// UPDATE a product - Admin only
router.put(
    '/:id',
    protect,
    authorize('admin'),
    upload.single('image'),
    productController.updateProduct
);

// DELETE a product - Admin only
router.delete(
    '/:id',
    protect,
    authorize('admin'),
    productController.deleteProduct
);

module.exports = router;