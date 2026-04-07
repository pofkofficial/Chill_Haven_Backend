const express = require('express');
const router = express.Router();
const {
  initializePayment,
  verifyPayment,
  paystackWebhook,
  getSalesSummary,
  getAllPurchases,
  getPurchasesByEvent 
} = require('../controllers/purchaseController');

router.post('/initialize', initializePayment);
router.get('/verify/:reference', verifyPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), paystackWebhook);
router.get('/summary', getSalesSummary);
router.get('/all', getAllPurchases);

module.exports = router;