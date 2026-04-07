const mongoose = require('mongoose');

const ticketConfigSchema = new mongoose.Schema({
  earlyBirdPrice: { type: Number, required: true, min: 0 },
  regularPrice: { type: Number, required: true, min: 0 },
  maxAvailable: { type: Number, required: true, min: 1, default: 100 }
});

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  venue: { type: String, required: true },
  earlyBirdEnd: { type: Date, required: true },
  singleTicket: ticketConfigSchema,
  doubleTicket: { 
    ...ticketConfigSchema.obj,
    // Override to make it optional
    earlyBirdPrice: { type: Number, min: 0, default: null },
    regularPrice: { type: Number, min: 0, default: null },
    maxAvailable: { type: Number, min: 1, default: 50 }
  },
  doubleTicketAvailable: { type: Boolean, default: false }  // ← New field
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);