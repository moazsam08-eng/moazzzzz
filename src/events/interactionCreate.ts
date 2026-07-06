import { Interaction } from 'discord.js';
import { ModBot } from '../types/ModBot';
import { TicketManager } from '../ticket/ticketManager';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction, client: ModBot): Promise<void> {
    try {
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_create' || 
                interaction.customId.startsWith('ticket_create_')) {
                const ticketManager = new TicketManager(client);
                if (interaction.isButton()) {
                    await ticketManager.handleInteraction(interaction);
                }
                return;
            }

            if (interaction.isButton() && interaction.customId.startsWith('ticket_claim_')) {
                const ticketManager = new TicketManager(client);
                await ticketManager.handleClaim(interaction);
                return;
            }

            if (interaction.isButton() && interaction.customId.startsWith('ticket_close_')) {
                const ticketManager = new TicketManager(client);
                await ticketManager.handleClose(interaction);
                return;
            }
        }


    } catch (error) {
        console.error('Error handling interaction:', error);
        
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            }).catch(() => {
                console.error('Could not send error response');
            });
        }
    }
} 
