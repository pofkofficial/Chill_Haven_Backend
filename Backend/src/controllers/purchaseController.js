const TicketPurchase = require('../models/TicketPurchase');
const Event = require('../models/Event');
const { initializeTransaction, verifyTransaction, verifyWebhookSignature } = require('../utils/paystack');
const crypto = require('crypto');

const initializePayment = async (req, res) => {
  try {
    const { eventId, ticketType, participants } = req.body;

    if (!['single', 'double'].includes(ticketType)) 
      return res.status(400).json({ msg: 'Invalid ticket type' });

    if ((ticketType === 'single' && participants.length !== 1) || 
        (ticketType === 'double' && participants.length !== 2)) {
      return res.status(400).json({ 
        msg: `Exactly ${ticketType === 'single' ? 1 : 2} participant(s) required` 
      });
    }

    // Double ticket phone uniqueness
    if (ticketType === 'double' && participants[0].phone === participants[1].phone) {
      return res.status(400).json({ msg: 'Phone numbers must be different for double ticket' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ msg: 'Event not found' });

    // Check real availability (only paid tickets)
    const sold = await TicketPurchase.countDocuments({ 
      event: eventId, 
      ticketType, 
      status: 'paid' 
    });

    const max = ticketType === 'single' 
      ? event.singleTicket.maxAvailable 
      : event.doubleTicket.maxAvailable;

    if (sold >= max) {
      return res.status(400).json({ msg: 'No more tickets available for this type' });
    }

    // Calculate current price (Early Bird or Regular)
    const now = new Date();
    const earlyBirdEndDate = new Date(event.earlyBirdEnd);
    const isEarlyBird = now < earlyBirdEndDate;
    
    // Debug logging
    console.log('=== Early Bird Check ===');
    console.log('Current time:', now);
    console.log('Early bird ends:', earlyBirdEndDate);
    console.log('Is early bird active:', isEarlyBird);
    
    const price = isEarlyBird
      ? (ticketType === 'single' ? event.singleTicket.earlyBirdPrice : event.doubleTicket.earlyBirdPrice)
      : (ticketType === 'single' ? event.singleTicket.regularPrice : event.doubleTicket.regularPrice);
    
    console.log('Price:', price);
    console.log('Ticket type:', ticketType);
    console.log('========================');

    const reference = `TICKET-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    // Store purchase data temporarily in the Paystack metadata
    const purchaseData = {
      eventId,
      ticketType,
      participants,
      amountPaid: price,
      isEarlyBird,
      paystackReference: reference
    };

    const callbackUrl = `${process.env.FRONTEND_LINK}?reference=${reference}`;

    const paystackData = await initializeTransaction(
      participants[0].email,
      price,
      reference,
      callbackUrl,
      { 
        purchaseData: JSON.stringify(purchaseData)  // Store in metadata
      }
    );

    res.json({
      authorization_url: paystackData.data.authorization_url,
      reference,
      access_code: paystackData.data.access_code
    });

  } catch (err) {
    console.error("Initialize Payment Error:", err.message);
    res.status(500).json({ msg: err.message || 'Payment initialization failed' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const paystackRes = await verifyTransaction(reference);

    if (paystackRes.data.status === 'success') {
      // Get metadata from Paystack response
      const metadata = paystackRes.data.metadata;
      let purchaseData;
      
      if (metadata && metadata.purchaseData) {
        purchaseData = JSON.parse(metadata.purchaseData);
      } else {
        // Fallback: try to find existing purchase if any
        const existingPurchase = await TicketPurchase.findOne({ paystackReference: reference });
        if (existingPurchase && existingPurchase.status === 'paid') {
          return res.json({ success: true, purchase: existingPurchase });
        }
        return res.status(400).json({ success: false, msg: 'Purchase data not found' });
      }

      // Create the purchase record ONLY after successful payment
      const purchase = new TicketPurchase({
        event: purchaseData.eventId,
        ticketType: purchaseData.ticketType,
        participants: purchaseData.participants,
        amountPaid: purchaseData.amountPaid,
        paystackReference: reference,
        isEarlyBird: purchaseData.isEarlyBird,
        status: 'paid',
        paymentDate: new Date()
      });

      await purchase.save();
      
      console.log(`✅ Purchase created with isEarlyBird = ${purchase.isEarlyBird}`);

      return res.json({ success: true, purchase });
    }

    res.status(400).json({ success: false, msg: 'Payment verification failed' });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ msg: err.message });
  }
};

const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];

    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('Invalid webhook signature received');
      return res.status(400).send('Invalid signature');
    }

    const eventType = req.body.event;

    if (eventType === 'charge.success') {
      const reference = req.body.data.reference;
      const metadata = req.body.data.metadata;

      // Check if purchase already exists
      let purchase = await TicketPurchase.findOne({ paystackReference: reference });
      
      if (!purchase && metadata && metadata.purchaseData) {
        // Create purchase from metadata
        const purchaseData = JSON.parse(metadata.purchaseData);
        
        purchase = new TicketPurchase({
          event: purchaseData.eventId,
          ticketType: purchaseData.ticketType,
          participants: purchaseData.participants,
          amountPaid: purchaseData.amountPaid,
          paystackReference: reference,
          isEarlyBird: purchaseData.isEarlyBird,
          status: 'paid',
          paymentDate: new Date()
        });
        
        await purchase.save();
        console.log(`✅ Webhook: Purchase created with isEarlyBird = ${purchase.isEarlyBird}`);
      } else if (purchase && purchase.status !== 'paid') {
        // Update existing purchase
        purchase.status = 'paid';
        purchase.paymentDate = new Date();
        await purchase.save();
        console.log(`✅ Webhook: Purchase updated to paid for reference: ${reference}`);
      }
    }

    // Always return 200 to Paystack
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.sendStatus(200); // Never fail webhook
  }
};

const getSalesSummary = async (req, res) => {
  try {
    const purchases = await TicketPurchase.find({ status: 'paid' })
      .populate('event', 'title date');

    let totalTicketsSold = 0;
    let totalRevenue = 0;
    let totalEarlyBirdTickets = 0;
    let totalRegularTickets = 0;

    const eventStats = {};

    purchases.forEach((purchase) => {
      // Skip purchases with null event (deleted events)
      if (!purchase.event) {
        console.log(`Skipping purchase ${purchase._id} - event not found (possibly deleted)`);
        return;
      }

      const count = 1; // Each purchase is 1 ticket
      totalTicketsSold += count;
      totalRevenue += purchase.amountPaid;
      
      if (purchase.isEarlyBird) {
        totalEarlyBirdTickets += count;
      } else {
        totalRegularTickets += count;
      }

      const eventId = purchase.event._id.toString();
      if (!eventStats[eventId]) {
        eventStats[eventId] = {
          title: purchase.event.title,
          ticketsSold: 0,
          revenue: 0,
          earlyBirdTickets: 0,
          regularTickets: 0
        };
      }
      eventStats[eventId].ticketsSold += count;
      eventStats[eventId].revenue += purchase.amountPaid;
      
      if (purchase.isEarlyBird) {
        eventStats[eventId].earlyBirdTickets += count;
      } else {
        eventStats[eventId].regularTickets += count;
      }
    });

    res.json({
      totalTicketsSold,
      totalRevenue,
      totalEarlyBirdTickets,
      totalRegularTickets,
      totalEventsWithSales: Object.keys(eventStats).length,
      eventStats: Object.values(eventStats)
    });
  } catch (err) {
    console.error('Sales Summary Error:', err);
    res.status(500).json({ msg: 'Failed to fetch sales summary' });
  }
};

const debugSalesData = async (req, res) => {
  try {
    // Get all paid purchases
    const purchases = await TicketPurchase.find({ status: 'paid' })
      .populate('event', 'title');
    
    // Get all events
    const events = await Event.find({});
    
    // Calculate totals
    const totalPaid = purchases.length;
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
    
    const earlyBirdCount = purchases.filter(p => p.isEarlyBird).length;
    const regularCount = purchases.filter(p => !p.isEarlyBird).length;
    
    // Group by event
    const byEvent = {};
    purchases.forEach(p => {
      const eventName = p.event?.title || 'Unknown';
      if (!byEvent[eventName]) {
        byEvent[eventName] = {
          count: 0,
          revenue: 0,
          earlyBird: 0,
          regular: 0
        };
      }
      byEvent[eventName].count++;
      byEvent[eventName].revenue += p.amountPaid;
      if (p.isEarlyBird) {
        byEvent[eventName].earlyBird++;
      } else {
        byEvent[eventName].regular++;
      }
    });
    
    res.json({
      summary: {
        totalPurchases: totalPaid,
        totalRevenue,
        earlyBirdTickets: earlyBirdCount,
        regularTickets: regularCount
      },
      byEvent,
      allPurchases: purchases.map(p => ({
        event: p.event?.title,
        type: p.ticketType,
        amount: p.amountPaid,
        isEarlyBird: p.isEarlyBird,
        status: p.status,
        date: p.paymentDate
      })),
      events: events.map(e => ({
        title: e.title,
        singleMax: e.singleTicket.maxAvailable,
        doubleMax: e.doubleTicket.maxAvailable,
        doubleAvailable: e.doubleTicketAvailable
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
};

const getAllPurchases = async (req, res) => {
  try {
    // Get all purchases (both pending and paid) with event details
    const purchases = await TicketPurchase.find({})
      .populate('event', 'title date earlyBirdEnd')
      .sort({ createdAt: -1 }); // Most recent first

    // Format the response with readable data, skipping purchases with null event
    const formattedPurchases = purchases
      .filter(purchase => purchase.event) // Only include purchases with valid event
      .map(purchase => ({
        _id: purchase._id,
        reference: purchase.paystackReference,
        event: {
          id: purchase.event._id,
          title: purchase.event.title,
          date: purchase.event.date
        },
        ticketType: purchase.ticketType,
        participants: purchase.participants,
        amountPaid: purchase.amountPaid,
        isEarlyBird: purchase.isEarlyBird,
        status: purchase.status,
        paymentDate: purchase.paymentDate,
        createdAt: purchase.createdAt
      }));

    // Get summary statistics
    const totalPurchases = purchases.filter(p => p.event).length;
    const totalRevenue = purchases
      .filter(p => p.status === 'paid' && p.event)
      .reduce((sum, p) => sum + p.amountPaid, 0);
    const paidCount = purchases.filter(p => p.status === 'paid' && p.event).length;
    const pendingCount = purchases.filter(p => p.status === 'pending' && p.event).length;

    res.json({
      success: true,
      count: totalPurchases,
      summary: {
        totalRevenue,
        paid: paidCount,
        pending: pendingCount
      },
      purchases: formattedPurchases
    });
  } catch (err) {
    console.error('Get All Purchases Error:', err);
    res.status(500).json({ 
      success: false, 
      msg: 'Failed to fetch purchases',
      error: err.message 
    });
  }
};

const getPurchasesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const purchases = await TicketPurchase.find({ 
      event: eventId,
      status: 'paid' 
    })
      .populate('event', 'title date')
      .sort({ createdAt: -1 });

    const totalRevenue = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
    const totalTickets = purchases.length;

    res.json({
      success: true,
      event: purchases[0]?.event || null,
      summary: {
        totalTickets,
        totalRevenue,
        earlyBirdTickets: purchases.filter(p => p.isEarlyBird).length,
        regularTickets: purchases.filter(p => !p.isEarlyBird).length
      },
      purchases: purchases.map(purchase => ({
        _id: purchase._id,
        reference: purchase.paystackReference,
        ticketType: purchase.ticketType,
        participants: purchase.participants,
        amountPaid: purchase.amountPaid,
        isEarlyBird: purchase.isEarlyBird,
        paymentDate: purchase.paymentDate,
        createdAt: purchase.createdAt
      }))
    });
  } catch (err) {
    console.error('Get Purchases By Event Error:', err);
    res.status(500).json({ 
      success: false, 
      msg: 'Failed to fetch purchases for this event' 
    });
  }
};

module.exports = { 
  initializePayment, 
  verifyPayment, 
  paystackWebhook, 
  getSalesSummary,
  debugSalesData,
  getAllPurchases,
  getPurchasesByEvent
};