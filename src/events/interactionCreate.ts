import { Interaction, Events } from 'discord.js';
import {
  handleOpen, handleModal, handleClose, handleClaim,
  handleOwner, handleSupport, handleEdit, handleTranscript,
} from '../ticket/ticketManager';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = (interaction.client as any).commands?.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'tkt_close')      { await handleClose(interaction);      return; }
      if (id === 'tkt_claim')      { await handleClaim(interaction);      return; }
      if (id === 'tkt_owner')      { await handleOwner(interaction);      return; }
      if (id === 'tkt_support')    { await handleSupport(interaction);    return; }
      if (id === 'tkt_edit')       { await handleEdit(interaction);       return; }
      if (id === 'tkt_transcript') { await handleTranscript(interaction); return; }
      if (id.startsWith('tkt_open_')) { await handleOpen(interaction, id.replace('tkt_open_','')); return; }
    }

    // Select menu (بانل)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'tkt_open_menu') {
        const key = interaction.values[0].replace('tkt_open_','');
        await handleOpen(interaction, key);
        return;
      }
    }

    // Modal (سبب التذكرة)
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('tkt_modal_')) {
        await handleModal(interaction, interaction.customId.replace('tkt_modal_',''));
        return;
      }
    }

  } catch (err) {
    console.error('[interactionCreate]', err);
    if (interaction.isRepliable() && !(interaction as any).replied && !(interaction as any).deferred) {
      await (interaction as any).reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => null);
    }
  }
}
