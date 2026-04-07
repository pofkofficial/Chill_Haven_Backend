const Event = require('../models/Event');
const TicketPurchase = require('../models/TicketPurchase');

const createEvent = async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ msg: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ msg: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ msg: 'Event not found' });
    res.json({ msg: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const getEventAvailability = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ msg: 'Event not found' });

    const now = new Date();
    const isEarlyBirdPeriod = now < new Date(event.earlyBirdEnd);

    // Count paid tickets
    const singleSold = await TicketPurchase.countDocuments({
      event: event._id,
      ticketType: 'single',
      status: 'paid'
    });

    const doubleSold = await TicketPurchase.countDocuments({
      event: event._id,
      ticketType: 'double',
      status: 'paid'
    });

    // Early bird counts
    const singleEarlyBirdSold = await TicketPurchase.countDocuments({
      event: event._id,
      ticketType: 'single',
      isEarlyBird: true,
      status: 'paid'
    });

    const doubleEarlyBirdSold = await TicketPurchase.countDocuments({
      event: event._id,
      ticketType: 'double',
      isEarlyBird: true,
      status: 'paid'
    });

    // Safe calculations
    const singleRemaining = Math.max(0, (event.singleTicket?.maxAvailable || 0) - singleEarlyBirdSold);
    const doubleRemaining = event.doubleTicketAvailable && event.doubleTicket
      ? Math.max(0, (event.doubleTicket.maxAvailable || 0) - doubleEarlyBirdSold) 
      : 0;

    const singleRegularSold = singleSold - singleEarlyBirdSold;
    const doubleRegularSold = doubleSold - doubleEarlyBirdSold;

    // Calculate revenue for each type
    const singleEarlyBirdRevenue = singleEarlyBirdSold * (event.singleTicket?.earlyBirdPrice || 0);
    const singleRegularRevenue = singleRegularSold * (event.singleTicket?.regularPrice || 0);
    const singleTotalRevenue = singleEarlyBirdRevenue + singleRegularRevenue;

    const doubleEarlyBirdRevenue = doubleEarlyBirdSold * (event.doubleTicket?.earlyBirdPrice || 0);
    const doubleRegularRevenue = doubleRegularSold * (event.doubleTicket?.regularPrice || 0);
    const doubleTotalRevenue = doubleEarlyBirdRevenue + doubleRegularRevenue;

    const totalRevenue = singleTotalRevenue + doubleTotalRevenue;

    res.json({
      isEarlyBird: isEarlyBirdPeriod,
      totalRevenue,
      single: {
        price: isEarlyBirdPeriod ? (event.singleTicket?.earlyBirdPrice || 0) : (event.singleTicket?.regularPrice || 0),
        earlyBirdPrice: event.singleTicket?.earlyBirdPrice || 0,
        regularPrice: event.singleTicket?.regularPrice || 0,
        remaining: singleRemaining,
        maxAvailable: event.singleTicket?.maxAvailable || 0,
        sold: singleSold,
        earlyBirdSold: singleEarlyBirdSold,
        regularSold: singleRegularSold,
        earlyBirdRevenue: singleEarlyBirdRevenue,
        regularRevenue: singleRegularRevenue,
        totalRevenue: singleTotalRevenue
      },
      double: {
        price: isEarlyBirdPeriod ? (event.doubleTicket?.earlyBirdPrice || 0) : (event.doubleTicket?.regularPrice || 0),
        earlyBirdPrice: event.doubleTicket?.earlyBirdPrice || 0,
        regularPrice: event.doubleTicket?.regularPrice || 0,
        remaining: doubleRemaining,
        maxAvailable: event.doubleTicket?.maxAvailable || 0,
        sold: doubleSold,
        earlyBirdSold: doubleEarlyBirdSold,
        regularSold: doubleRegularSold,
        earlyBirdRevenue: doubleEarlyBirdRevenue,
        regularRevenue: doubleRegularRevenue,
        totalRevenue: doubleTotalRevenue,
        available: event.doubleTicketAvailable || false
      }
    });
  } catch (err) {
    console.error('Get Availability Error:', err);
    res.status(500).json({ msg: 'Failed to get availability' });
  }
};

module.exports = { 
  createEvent, 
  getAllEvents, 
  getEventById, 
  updateEvent, 
  deleteEvent, 
  getEventAvailability 
};