import {
  ChatInputCommandInteraction, ComponentType,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType, Colors,
} from 'discord.js';
import { TicketConfig } from '../models/TicketConfig';

export async function runTicketSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const cfg = await TicketConfig.findOne({ guildId: interaction.guildId! })
    ?? new TicketConfig({ guildId: interaction.guildId!, sections: [] });

  // ── الشاشة الرئيسية للـ wizard
  async function showMain(): Promise<void> {
    const hasSections = cfg.sections.length > 0;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎫 إعداد نظام التذاكر')
      .setDescription(
        hasSections
          ? `**الأقسام الحالية:**\n${cfg.sections.map((s,i)=>`${i+1}. ${s.emoji} ${s.name}`).join('\n')}`
          : '**لا توجد أقسام بعد.** اضغط "➕ إضافة قسم" للبدء.'
      )
      .setFooter({ text: 'يمكنك إضافة حتى 5 أقسام' });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ts_add').setLabel('➕ إضافة قسم').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ts_edit').setLabel('✏️ تعديل قسم').setStyle(ButtonStyle.Primary).setDisabled(!hasSections),
      new ButtonBuilder().setCustomId('ts_del').setLabel('🗑️ حذف قسم').setStyle(ButtonStyle.Danger).setDisabled(!hasSections),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ts_done').setLabel('✅ حفظ وإنهاء').setStyle(ButtonStyle.Success).setDisabled(!hasSections),
    );

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });

    const reply = await interaction.fetchReply();
    const col = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

    col.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id) { await btn.reply({ content: '❌ ليس لك.', ephemeral: true }); return; }
      col.stop();

      if (btn.customId === 'ts_add')  { await btn.deferUpdate(); await addSection(); }
      if (btn.customId === 'ts_edit') { await btn.deferUpdate(); await editSection(); }
      if (btn.customId === 'ts_del')  { await btn.deferUpdate(); await deleteSection(); }
      if (btn.customId === 'ts_done') {
        await btn.deferUpdate();
        cfg.updatedAt = new Date();
        await cfg.save();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('✅ تم الحفظ بنجاح!').setDescription('استخدم `/send-panel-ticket` لإرسال البانل.')], components: [] });
      }
    });
  }

  // ── إضافة قسم جديد
  async function addSection(): Promise<void> {
    if (cfg.sections.length >= 5) {
      await interaction.editReply({ content: '❌ الحد الأقصى 5 أقسام.', components: [] });
      return;
    }
    const section: any = {};

    // 1) اسم القسم
    const nameEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('➕ إضافة قسم — الخطوة 1/5').setDescription('اكتب **اسم القسم** في الشات (مثال: دعم فني)');
    await interaction.editReply({ embeds: [nameEmbed], components: [] });
    const nameMsg = await interaction.channel!.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60_000 });
    if (!nameMsg.size) { await showMain(); return; }
    section.name = nameMsg.first()!.content.trim();
    await nameMsg.first()!.delete().catch(() => null);

    // 2) إيموجي
    const emojiEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('➕ إضافة قسم — الخطوة 2/5').setDescription('اكتب **إيموجي** للقسم (مثال: 🛠️)');
    await interaction.editReply({ embeds: [emojiEmbed], components: [] });
    const emojiMsg = await interaction.channel!.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30_000 });
    section.emoji = emojiMsg.size ? emojiMsg.first()!.content.trim() : '🎫';
    await emojiMsg.first()?.delete().catch(() => null);

    // 3) الكاتيجوري
    const catEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('➕ إضافة قسم — الخطوة 3/5').setDescription('اختر **الكاتيجوري** التي ستُفتح فيها تذاكر هذا القسم');
    const catRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('ts_cat').setPlaceholder('اختر الكاتيجوري').setChannelTypes(ChannelType.GuildCategory)
    );
    await interaction.editReply({ embeds: [catEmbed], components: [catRow] });
    const catReply = await interaction.fetchReply();
    const catCol = catReply.createMessageComponentCollector({ componentType: ComponentType.ChannelSelect, time: 60_000 });
    await new Promise<void>(res => catCol.once('collect', async c => { await c.deferUpdate(); section.categoryId = c.values[0]; catCol.stop(); res(); }));

    // 4) رول الستاف
    const roleEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('➕ إضافة قسم — الخطوة 4/5').setDescription('اختر **رول الستاف** المسؤول عن هذا القسم');
    const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
      new RoleSelectMenuBuilder().setCustomId('ts_role').setPlaceholder('اختر رول الستاف')
    );
    await interaction.editReply({ embeds: [roleEmbed], components: [roleRow] });
    const roleReply = await interaction.fetchReply();
    const roleCol = roleReply.createMessageComponentCollector({ componentType: ComponentType.RoleSelect, time: 60_000 });
    await new Promise<void>(res => roleCol.once('collect', async c => { await c.deferUpdate(); section.supportRoleId = c.values[0]; roleCol.stop(); res(); }));

    // 5) قناة اللوق
    const logEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('➕ إضافة قسم — الخطوة 5/5').setDescription('اختر **قناة اللوق** لهذا القسم');
    const logRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('ts_log').setPlaceholder('اختر قناة اللوق').setChannelTypes(ChannelType.GuildText)
    );
    await interaction.editReply({ embeds: [logEmbed], components: [logRow] });
    const logReply = await interaction.fetchReply();
    const logCol = logReply.createMessageComponentCollector({ componentType: ComponentType.ChannelSelect, time: 60_000 });
    await new Promise<void>(res => logCol.once('collect', async c => { await c.deferUpdate(); section.logChannelId = c.values[0]; logCol.stop(); res(); }));

    section.ownershipEnabled = true;
    section.reasonEnabled    = true;
    section.welcomeMsg       = `مرحباً {user}! سيرد عليك فريق الدعم في قسم **${section.name}** قريباً.`;
    section.enabled          = true;

    cfg.sections.push(section);
    await showMain();
  }

  // ── تعديل قسم
  async function editSection(): Promise<void> {
    const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('ts_edit_pick').setPlaceholder('اختر القسم للتعديل')
        .addOptions(cfg.sections.map((s,i) => new StringSelectMenuOptionBuilder().setLabel(`${s.emoji} ${s.name}`).setValue(String(i))))
    );
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('✏️ اختر قسماً للتعديل')], components: [menu] });
    const r = await interaction.fetchReply();
    const c = r.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30_000 });
    c.once('collect', async sel => {
      await sel.deferUpdate();
      const idx = parseInt(sel.values[0]);
      const s   = cfg.sections[idx];
      const optRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId('ts_edit_opt').setPlaceholder('ماذا تريد تعديله؟')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('الاسم').setValue('name'),
            new StringSelectMenuOptionBuilder().setLabel('الإيموجي').setValue('emoji'),
            new StringSelectMenuOptionBuilder().setLabel('رسالة الترحيب').setValue('welcome'),
            new StringSelectMenuOptionBuilder().setLabel('Ownership').setValue('ownership'),
            new StringSelectMenuOptionBuilder().setLabel('Reason').setValue('reason'),
          )
      );
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle(`✏️ تعديل: ${s.emoji} ${s.name}`)], components: [optRow] });
      const r2 = await interaction.fetchReply();
      const c2 = r2.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30_000 });
      c2.once('collect', async opt => {
        const field = opt.values[0];
        if (field === 'ownership') { await opt.deferUpdate(); s.ownershipEnabled = !s.ownershipEnabled; await showMain(); return; }
        if (field === 'reason')    { await opt.deferUpdate(); s.reasonEnabled    = !s.reasonEnabled;    await showMain(); return; }
        const modal = new ModalBuilder().setCustomId(`ts_modal_${field}_${idx}`).setTitle(`تعديل ${field}`);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('val').setLabel(`القيمة الجديدة`).setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await opt.showModal(modal);
        const submitted = await opt.awaitModalSubmit({ time: 60_000 }).catch(() => null);
        if (submitted) {
          await submitted.deferUpdate();
          const val = submitted.fields.getTextInputValue('val');
          if (field === 'name')    s.name    = val;
          if (field === 'emoji')   s.emoji   = val;
          if (field === 'welcome') s.welcomeMsg = val;
          await cfg.save();
        }
        await showMain();
      });
    });
  }

  // ── حذف قسم
  async function deleteSection(): Promise<void> {
    const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('ts_del_pick').setPlaceholder('اختر القسم للحذف')
        .addOptions(cfg.sections.map((s,i) => new StringSelectMenuOptionBuilder().setLabel(`${s.emoji} ${s.name}`).setValue(String(i))))
    );
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('🗑️ اختر قسماً للحذف')], components: [menu] });
    const r = await interaction.fetchReply();
    const c = r.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30_000 });
    c.once('collect', async sel => {
      await sel.deferUpdate();
      cfg.sections.splice(parseInt(sel.values[0]), 1);
      await showMain();
    });
  }

  await showMain();
}
