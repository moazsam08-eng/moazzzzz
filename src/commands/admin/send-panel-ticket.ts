import {
  ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel,
} from 'discord.js';
import { TicketConfig } from '../../models/TicketConfig';

export const data = new SlashCommandBuilder()
  .setName('send-panel-ticket')
  .setDescription('إرسال بانل التذاكر للقناة الحالية')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const cfg = await TicketConfig.findOne({ guildId: interaction.guildId! });

  if (!cfg || cfg.sections.length === 0) {
    await interaction.editReply({ content: '❌ قم بتشغيل `/ticket-setup` أولاً.' }); return;
  }

  const enabled = cfg.sections.filter(s => s.enabled);
  const embed   = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎫 نظام التذاكر')
    .setDescription('اضغط أدناه لفتح تذكرة دعم جديدة\n\nاختر نوع التذكرة من القائمة')
    .setThumbnail(interaction.guild?.iconURL() ?? null)
    .setTimestamp();

  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_open_menu')
      .setPlaceholder('📋 اضغط لفتح التذكرة')
      .addOptions(enabled.map(s =>
        new StringSelectMenuOptionBuilder()
          .setLabel(s.name)
          .setDescription(`افتح تذكرة ${s.name}`)
          .setValue(`tkt_open_${s.name.toLowerCase().replace(/\s+/g,'_')}`)
          .setEmoji(s.emoji)
      ))
  );

  const ch = interaction.channel as TextChannel;
  await ch.send({ embeds: [embed], components: [menu] });
  await interaction.editReply({ content: '✅ تم إرسال البانل.' });
}
