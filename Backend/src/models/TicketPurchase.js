const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true }
});

const TicketPurchaseSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  ticketType: { type: String, enum: ['single', 'double'], required: true },
  participants: { type: [participantSchema], required: true },
  amountPaid: { type: Number, required: true },
  paystackReference: { type: String, required: true, unique: true },
  isEarlyBird: { type: Boolean, required: true  },  // ← Add this field
  status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymentDate: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('TicketPurchase', TicketPurchaseSchema);