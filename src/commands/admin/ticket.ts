import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { runTicketSetup } from '../../ticket/ticketSetup';

export const data = new SlashCommandBuilder()
  .setName('ticket-setup')
  .setDescription('إعداد نظام التذاكر خطوة بخطوة')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await runTicketSetup(interaction);
}
