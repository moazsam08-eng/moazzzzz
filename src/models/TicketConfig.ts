import { Schema, model, Document } from 'mongoose';

export interface ITicketSection {
  name: string;
  emoji: string;
  categoryId: string;
  supportRoleId: string;
  logChannelId: string;
  ownershipEnabled: boolean;
  reasonEnabled: boolean;
  welcomeMsg: string;
  enabled: boolean;
}

export interface ITicketConfig extends Document {
  guildId: string;
  sections: ITicketSection[];
  panelChannelId?: string;
  updatedAt: Date;
}

const SectionSchema = new Schema<ITicketSection>({
  name:            { type: String, required: true },
  emoji:           { type: String, default: '🎫' },
  categoryId:      { type: String, required: true },
  supportRoleId:   { type: String, required: true },
  logChannelId:    { type: String, required: true },
  ownershipEnabled:{ type: Boolean, default: true },
  reasonEnabled:   { type: Boolean, default: true },
  welcomeMsg:      { type: String, default: 'مرحباً {user}! سيرد عليك فريق الدعم قريباً.' },
  enabled:         { type: Boolean, default: true },
});

const TicketConfigSchema = new Schema<ITicketConfig>({
  guildId:       { type: String, required: true, unique: true },
  sections:      { type: [SectionSchema], default: [] },
  panelChannelId:{ type: String },
  updatedAt:     { type: Date, default: Date.now },
});

export const TicketConfig = model<ITicketConfig>('TicketConfig', TicketConfigSchema);
