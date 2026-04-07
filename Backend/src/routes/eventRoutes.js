const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  createEvent, getAllEvents, getEventById, updateEvent, deleteEvent, getEventAvailability
} = require('../controllers/eventController');

router.get('/', getAllEvents);                    // public
router.get('/:id', getEventById);                 // public
router.get('/:id/availability', getEventAvailability); // public

router.get('/', getAllEvents);
router.post('/', protect, createEvent);           // admin only
router.put('/:id', protect, updateEvent);         // admin only
router.delete('/:id', protect, deleteEvent);      // admin only

module.exports = router;