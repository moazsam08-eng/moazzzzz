import { Schema, model, Document } from 'mongoose';

export interface ITicket extends Document {
  guildId:    string;
  channelId:  string;
  ownerId:    string;
  ownerTag:   string;
  sectionName:string;
  reason?:    string;
  status:     'open' | 'closed';
  claimedBy?: string;
  closedBy?:  string;
  closedAt?:  Date;
  createdAt:  Date;
  number:     number;
}

const TicketSchema = new Schema<ITicket>({
  guildId:    { type: String, required: true, index: true },
  channelId:  { type: String, required: true, unique: true },
  ownerId:    { type: String, required: true },
  ownerTag:   { type: String, required: true },
  sectionName:{ type: String, required: true },
  reason:     { type: String },
  status:     { type: String, enum: ['open','closed'], default: 'open' },
  claimedBy:  { type: String },
  closedBy:   { type: String },
  closedAt:   { type: Date },
  createdAt:  { type: Date, default: Date.now },
  number:     { type: Number, required: true },
});

export const Ticket = model<ITicket>('Ticket', TicketSchema);
