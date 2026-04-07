const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const BASE_URL = 'https://api.paystack.co';

const https = require('https');

const initializeTransaction = async (email, amount, reference, callbackUrl, metadata = {}) => {
  const agent = new https.Agent({
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',     // Force TLS 1.2+
    maxVersion: 'TLSv1.3'
  });

  const response = await axios.post(`${BASE_URL}/transaction/initialize`, {
    email,
    amount: Math.round(amount * 100),
    reference,
    callback_url: callbackUrl,
    metadata
  }, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json'
    },
    httpsAgent: agent   // ← This is the key addition
  });

  return response.data;
};
const verifyTransaction = async (reference) => {
  const response = await axios.get(`${BASE_URL}/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
  });
  return response.data;
};

const verifyWebhookSignature = (body, signature) => {
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return hash === signature;
};

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature };