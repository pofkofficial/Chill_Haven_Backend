const TicketPurchase = require('../models/TicketPurchase');
const Event = require('../models/Event');

// Get all participants for an event
const getEventParticipants = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const purchases = await TicketPurchase.find({ 
      event: eventId, 
      status: 'paid' 
    }).sort({ createdAt: 1 });

    let participants = [];
    let checkedInCount = 0;

    purchases.forEach(purchase => {
      purchase.participants.forEach((participant, index) => {
        participants.push({
          purchaseId: purchase._id,
          reference: purchase.paystackReference,
          ticketType: purchase.ticketType,
          isEarlyBird: purchase.isEarlyBird,
          participantIndex: index,
          name: participant.name,
          phone: participant.phone,
          email: participant.email,
          checkedIn: participant.checkedIn || false,
          checkedInAt: participant.checkedInAt || null
        });
        if (participant.checkedIn) checkedInCount++;
      });
    });

    // Group participants by purchase
    const groupedParticipants = purchases.map(purchase => ({
      purchaseId: purchase._id,
      reference: purchase.paystackReference,
      ticketType: purchase.ticketType,
      isEarlyBird: purchase.isEarlyBird,
      participants: purchase.participants.map((p, idx) => ({
        index: idx,
        name: p.name,
        phone: p.phone,
        email: p.email,
        checkedIn: p.checkedIn || false,
        checkedInAt: p.checkedInAt || null
      }))
    }));

    res.json({
      success: true,
      totalParticipants: participants.length,
      checkedInCount,
      participants: groupedParticipants,
      flatList: participants
    });
  } catch (err) {
    console.error('Get Event Participants Error:', err);
    res.status(500).json({ msg: 'Failed to fetch participants' });
  }
};

// Check in a participant
const checkInParticipant = async (req, res) => {
  try {
    const { eventId, purchaseId, participantIndex } = req.body;

    const purchase = await TicketPurchase.findById(purchaseId);
    if (!purchase) {
      return res.status(404).json({ success: false, msg: 'Purchase not found' });
    }

    if (purchase.event.toString() !== eventId) {
      return res.status(400).json({ success: false, msg: 'Purchase does not belong to this event' });
    }

    if (participantIndex >= purchase.participants.length) {
      return res.status(400).json({ success: false, msg: 'Invalid participant index' });
    }

    if (purchase.participants[participantIndex].checkedIn) {
      return res.status(400).json({ success: false, msg: 'Participant already checked in' });
    }

    purchase.participants[participantIndex].checkedIn = true;
    purchase.participants[participantIndex].checkedInAt = new Date();
    await purchase.save();

    res.json({
      success: true,
      message: 'Participant checked in successfully',
      participant: purchase.participants[participantIndex]
    });
  } catch (err) {
    console.error('Check In Error:', err);
    res.status(500).json({ msg: 'Failed to check in participant' });
  }
};

module.exports = {
  getEventParticipants,
  checkInParticipant
};