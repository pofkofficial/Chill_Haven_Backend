const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  getEventParticipants,
  checkInParticipant
} = require('../controllers/attendanceController');

// Protected routes (admin only)
router.get('/event/:eventId/participants', protect, getEventParticipants);
router.post('/checkin', protect, checkInParticipant);

module.exports = router;