import {
  ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, AttachmentBuilder, TextChannel,
  OverwriteType, Colors, PermissionFlagsBits,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import { TicketConfig } from '../models/TicketConfig';
import { Ticket }       from '../models/Ticket';
import { generateTranscript } from '../utils/transcript';

// ── فتح التذكرة (من الزر أو المنيو)
export async function handleOpen(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  sectionName: string
): Promise<void> {
  const cfg = await TicketConfig.findOne({ guildId: interaction.guildId! });
  const section = cfg?.sections.find(s => s.name.toLowerCase().replace(/\s+/g,'_') === sectionName);
  if (!cfg || !section) { await interaction.reply({ content: '❌ القسم غير موجود.', ephemeral: true }); return; }

  // تذكرة مفتوحة موجودة؟
  const existing = await Ticket.findOne({ guildId: interaction.guildId!, ownerId: interaction.user.id, status: 'open' });
  if (existing) { await interaction.reply({ content: `❌ عندك تذكرة مفتوحة: <#${existing.channelId}>`, ephemeral: true }); return; }

  // سبب؟
  if (section.reasonEnabled) {
    const modal = new ModalBuilder().setCustomId(`tkt_modal_${sectionName}`).setTitle(`${section.emoji} ${section.name}`);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('سبب فتح التذكرة').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
    ));
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await createChannel(interaction, section, cfg, undefined);
}

// ── Modal submit (سبب)
export async function handleModal(interaction: ModalSubmitInteraction, sectionName: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const cfg     = await TicketConfig.findOne({ guildId: interaction.guildId! });
  const section = cfg?.sections.find(s => s.name.toLowerCase().replace(/\s+/g,'_') === sectionName);
  if (!cfg || !section) { await interaction.editReply({ content: '❌ القسم غير موجود.' }); return; }
  const reason = interaction.fields.getTextInputValue('reason');
  await createChannel(interaction, section, cfg, reason);
}

// ── إنشاء القناة
async function createChannel(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  section: any, cfg: any, reason?: string
): Promise<void> {
  const guild = interaction.guild!;
  const count = await Ticket.countDocuments({ guildId: guild.id }) + 1;
  const chName = `${section.emoji.replace(/\s/g,'')}-${interaction.user.username.toLowerCase().slice(0,15)}-${count.toString().padStart(4,'0')}`;

  const channel = await guild.channels.create({
    name: chName,
    parent: section.categoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles], type: OverwriteType.Member },
      { id: section.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles], type: OverwriteType.Role },
    ],
    topic: `🎫 ${section.name} | ${interaction.user.tag} | #${count.toString().padStart(4,'0')}`,
  }) as TextChannel;

  await Ticket.create({
    guildId: guild.id, channelId: channel.id,
    ownerId: interaction.user.id, ownerTag: interaction.user.tag,
    sectionName: section.name, reason, status: 'open',
    createdAt: new Date(), number: count,
  });

  // رسالة الترحيب
  const welcome = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`${section.emoji} ${section.name} — #${count.toString().padStart(4,'0')}`)
    .setDescription(section.welcomeMsg.replace('{user}', `<@${interaction.user.id}>`))
    .setTimestamp();
  if (reason) welcome.addFields({ name: '📝 السبب', value: reason });

  const ctrlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkt_close').setLabel('اغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tkt_claim').setLabel('استلام').setEmoji('✋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tkt_owner').setLabel('استدعاء الأونر').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkt_support').setLabel('طلب السبورت').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
  );
  const ctrlRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkt_edit').setLabel('تعديل التذكرة').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tkt_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: `<@${interaction.user.id}> <@&${section.supportRoleId}>`,
    embeds: [welcome],
    components: [ctrlRow, ctrlRow2],
  });

  // لوق
  const logCh = guild.channels.cache.get(section.logChannelId) as TextChannel | undefined;
  logCh?.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('📂 تذكرة جديدة')
    .addFields(
      { name: '👤 المالك',  value: `<@${interaction.user.id}>`, inline: true },
      { name: '🏷️ القسم',  value: section.name,                inline: true },
      { name: '📁 القناة', value: `<#${channel.id}>`,          inline: true },
      ...(reason ? [{ name: '📝 السبب', value: reason, inline: false }] : []),
    ).setTimestamp()] });

  await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${channel.id}>` });
}

// ── إغلاق
export async function handleClose(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  const channel = interaction.channel as TextChannel;
  const ticket  = await Ticket.findOne({ channelId: channel.id, status: 'open' });
  if (!ticket) { await interaction.editReply({ content: '❌ هذه القناة ليست تذكرة مفتوحة.' }); return; }

  const cfg     = await TicketConfig.findOne({ guildId: interaction.guildId! });
  const section = cfg?.sections.find(s => s.name === ticket.sectionName);
  const buf     = await generateTranscript(channel, ticket.ownerTag, ticket.sectionName).catch(() => null);

  ticket.status   = 'closed';
  ticket.closedAt = new Date();
  ticket.closedBy = interaction.user.tag;
  await ticket.save();

  if (section?.logChannelId && buf) {
    const logCh = interaction.guild?.channels.cache.get(section.logChannelId) as TextChannel | undefined;
    logCh?.send({
      embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('🔒 تذكرة مغلقة')
        .addFields(
          { name: '📁 القناة',      value: channel.name,           inline: true },
          { name: '👤 المالك',      value: `<@${ticket.ownerId}>`, inline: true },
          { name: '🏷️ القسم',      value: ticket.sectionName,     inline: true },
          { name: '🔒 أغلقها',     value: interaction.user.tag,   inline: true },
          { name: '🕐 الوقت',      value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
        ).setTimestamp()],
      files: [new AttachmentBuilder(buf, { name: `transcript-${channel.name}.html` })],
    });
  }

  await channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false }).catch(() => null);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('🔒 تم إغلاق التذكرة')
    .setDescription(`أُغلقت بواسطة ${interaction.user}\nسيتم حذف القناة خلال **5 ثوانٍ**...`).setTimestamp()] });
  await new Promise(r => setTimeout(r, 5000));
  await channel.delete().catch(() => null);
}

// ── استلام
export async function handleClaim(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  const ticket = await Ticket.findOne({ channelId: interaction.channel!.id, status: 'open' });
  if (!ticket) { await interaction.editReply({ content: '❌ ليست تذكرة مفتوحة.' }); return; }
  if (ticket.claimedBy) { await interaction.editReply({ content: `❌ مستلمة من <@${ticket.claimedBy}>.` }); return; }
  ticket.claimedBy = interaction.user.id; await ticket.save();
  await (interaction.channel as TextChannel).permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true });
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Yellow).setDescription(`✋ استلم ${interaction.user} هذه التذكرة.`).setTimestamp()] });
}

// ── استدعاء الأونر
export async function handleOwner(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  const ticket = await Ticket.findOne({ channelId: interaction.channel!.id, status: 'open' });
  if (!ticket) { await interaction.editReply({ content: '❌ ليست تذكرة مفتوحة.' }); return; }
  await interaction.editReply({ content: `🔇 <@${ticket.ownerId}> تم استدعاؤك للتذكرة!` });
}

// ── طلب السبورت
export async function handleSupport(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  const ticket  = await Ticket.findOne({ channelId: interaction.channel!.id, status: 'open' });
  const cfg     = await TicketConfig.findOne({ guildId: interaction.guildId! });
  const section = cfg?.sections.find(s => s.name === ticket?.sectionName);
  if (!ticket || !section) { await interaction.editReply({ content: '❌ ليست تذكرة مفتوحة.' }); return; }
  await interaction.editReply({ content: `🔔 <@&${section.supportRoleId}> مطلوب في هذه التذكرة!` });
}

// ── تعديل التذكرة (قائمة)
export async function handleEdit(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await Ticket.findOne({ channelId: interaction.channel!.id, status: 'open' });
  if (!ticket) { await interaction.editReply({ content: '❌ ليست تذكرة مفتوحة.' }); return; }

  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('tkt_edit_menu').setPlaceholder('اختر الإجراء')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Come — استدعاء صاحب التذكرة').setEmoji('👤').setValue('come'),
        new StringSelectMenuOptionBuilder().setLabel('Rename — تغيير اسم التذكرة').setEmoji('✏️').setValue('rename'),
        new StringSelectMenuOptionBuilder().setLabel('Add User — إضافة عضو').setEmoji('➕').setValue('add'),
        new StringSelectMenuOptionBuilder().setLabel('Remove User — إزالة عضو').setEmoji('➖').setValue('remove'),
        new StringSelectMenuOptionBuilder().setLabel('Reset Menu — إعادة تعيين الأزرار').setEmoji('🔄').setValue('reset'),
      )
  );
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('⚙️ تعديل التذكرة')], components: [menu] });

  const reply = await interaction.fetchReply();
  const col   = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30_000 });
  col.once('collect', async sel => {
    await sel.deferUpdate(); col.stop();
    const action  = sel.values[0];
    const channel = interaction.channel as TextChannel;

    if (action === 'come') {
      await channel.send({ content: `👤 <@${ticket.ownerId}> تم استدعاؤك!` });
      await interaction.editReply({ content: '✅ تم.', components: [] });
    }

    if (action === 'rename') {
      const modal = new ModalBuilder().setCustomId('tkt_rename').setTitle('تغيير اسم التذكرة');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('newname').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      await sel.showModal(modal).catch(()=>null);
      const submitted = await sel.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (submitted) {
        await submitted.deferUpdate();
        await channel.setName(submitted.fields.getTextInputValue('newname')).catch(() => null);
      }
      await interaction.editReply({ content: '✅ تم تغيير الاسم.', components: [] });
    }

    if (action === 'add') {
      await interaction.editReply({ content: '👤 اذكر المستخدم في الشات (mention)', components: [] });
      const msgs = await channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30_000 });
      const user = msgs.first()?.mentions.users.first();
      if (user) {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await channel.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`➕ تمت إضافة ${user}`)] });
      }
      await msgs.first()?.delete().catch(() => null);
    }

    if (action === 'remove') {
      await interaction.editReply({ content: '👤 اذكر المستخدم في الشات (mention)', components: [] });
      const msgs = await channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30_000 });
      const user = msgs.first()?.mentions.users.first();
      if (user && user.id !== ticket.ownerId) {
        await channel.permissionOverwrites.delete(user.id).catch(() => null);
        await channel.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`➖ تمت إزالة ${user}`)] });
      }
      await msgs.first()?.delete().catch(() => null);
    }

    if (action === 'reset') {
      const ctrlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('tkt_close').setLabel('اغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('tkt_claim').setLabel('استلام').setEmoji('✋').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('tkt_owner').setLabel('استدعاء الأونر').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tkt_support').setLabel('طلب السبورت').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
      );
      const ctrlRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('tkt_edit').setLabel('تعديل التذكرة').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tkt_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
      );
      await channel.send({ embeds: [new EmbedBuilder().setColor('#5865F2').setDescription('🔄 تم إعادة تعيين الأزرار')], components: [ctrlRow, ctrlRow2] });
      await interaction.editReply({ content: '✅ تم.', components: [] });
    }
  });
}

// ── Transcript
export async function handleTranscript(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await Ticket.findOne({ channelId: interaction.channel!.id });
  if (!ticket) { await interaction.editReply({ content: '❌ ليست تذكرة.' }); return; }
  const buf = await generateTranscript(interaction.channel as TextChannel, ticket.ownerTag, ticket.sectionName).catch(() => null);
  if (!buf) { await interaction.editReply({ content: '❌ فشل إنشاء الـ Transcript.' }); return; }
  await interaction.editReply({ content: '✅ Transcript:', files: [new AttachmentBuilder(buf, { name: `transcript-${(interaction.channel as TextChannel).name}.html` })] });
}
