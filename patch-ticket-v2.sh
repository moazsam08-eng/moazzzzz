#!/bin/bash

# ============================================================
#  Moaz Studio Bot — Ticket System FULL Patch v2
#  شغّل من جوه فولدر الريبو: bash patch-ticket-v2.sh
# ============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║   Moaz Studio — Ticket System v2 Full Patch  ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ شغّل السكريبت من جوه فولدر الريبو${NC}"; exit 1
fi

BACKUP="backup_ticket_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP"
for f in src/commands/admin/ticket.ts src/commands/admin/send-panel-ticket.ts \
          src/ticket/ticketManager.ts src/ticket/ticketSetup.ts \
          src/utils/transcript.ts src/models/Ticket.ts src/models/TicketConfig.ts \
          src/events/interactionCreate.ts dashboard/views/tickets.ejs \
          dashboard/routes/tickets.ts; do
  [ -f "$f" ] && { mkdir -p "$BACKUP/$(dirname $f)"; cp "$f" "$BACKUP/$f"; echo -e "  ${GREEN}backup:${NC} $f"; }
done

mkdir -p src/commands/admin src/ticket src/utils src/models src/events \
         dashboard/views dashboard/routes

echo -e "\n${BLUE}📝 جاري كتابة الفايلات...${NC}\n"

# ══════════════════════════════════════════════════════════════
# 1) src/models/TicketConfig.ts
# ══════════════════════════════════════════════════════════════
cat > src/models/TicketConfig.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/models/TicketConfig.ts"

# ══════════════════════════════════════════════════════════════
# 2) src/models/Ticket.ts
# ══════════════════════════════════════════════════════════════
cat > src/models/Ticket.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/models/Ticket.ts"

# ══════════════════════════════════════════════════════════════
# 3) src/utils/transcript.ts
# ══════════════════════════════════════════════════════════════
cat > src/utils/transcript.ts << 'EOF'
import { TextChannel, Message } from 'discord.js';

export async function generateTranscript(
  channel: TextChannel, ownerTag: string, sectionName: string
): Promise<Buffer> {
  const msgs: Message[] = [];
  let lastId: string | undefined;
  for (let i = 0; i < 2; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (!batch.size) break;
    msgs.push(...batch.values());
    lastId = batch.last()?.id;
  }
  msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return Buffer.from(buildHTML(channel.name, ownerTag, sectionName, msgs), 'utf-8');
}

function esc(s?: string | null) {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildHTML(name: string, owner: string, section: string, msgs: Message[]): string {
  const rows = msgs.map(m => {
    const time   = new Date(m.createdTimestamp).toLocaleString('ar-EG');
    const avatar = m.author.displayAvatarURL({ size: 32, extension: 'png' });
    const atts   = [...m.attachments.values()].map(a =>
      a.contentType?.startsWith('image/')
        ? `<img src="${a.url}" class="att-img">`
        : `<a href="${a.url}" class="att-link">📎 ${esc(a.name)}</a>`
    ).join('');
    const embeds = m.embeds.map(e => {
      const c = e.color ? '#'+e.color.toString(16).padStart(6,'0') : '#5865F2';
      return `<div class="emb" style="border-color:${c}">
        ${e.title?`<b>${esc(e.title)}</b>`:''}
        ${e.description?`<p>${esc(e.description)}</p>`:''}
        ${e.fields.map(f=>`<div><small><b>${esc(f.name)}</b></small><br>${esc(f.value)}</div>`).join('')}
      </div>`;
    }).join('');
    return `<div class="msg${m.author.bot?' bot':''}">
      <img class="av" src="${avatar}">
      <div class="body">
        <span class="au${m.author.bot?' b-tag':''}">${esc(m.author.tag)}</span>
        <span class="ts">${time}</span>
        <div class="txt">${esc(m.content)}</div>
        ${atts}${embeds}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>Transcript — ${esc(name)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#313338;color:#dcddde;direction:rtl}
header{background:#1e1f22;padding:18px 28px;border-bottom:3px solid #5865F2;display:flex;justify-content:space-between;align-items:center}
header h1{color:#fff;font-size:1.2rem}header p{color:#b5bac1;font-size:.82rem;margin-top:4px}
.badge{background:#5865F2;color:#fff;padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700}
.msgs{padding:20px 28px;display:flex;flex-direction:column;gap:2px}
.msg{display:flex;gap:10px;padding:6px 10px;border-radius:6px;transition:.15s}
.msg:hover{background:#2e3035}.msg.bot{opacity:.9}
.av{width:34px;height:34px;border-radius:50%;flex-shrink:0;margin-top:2px}
.body{flex:1}.au{font-weight:700;color:#fff;font-size:.88rem}
.au.b-tag::after{content:'BOT';background:#5865F2;color:#fff;font-size:.6rem;padding:1px 5px;border-radius:3px;margin-right:5px;vertical-align:middle}
.ts{font-size:.72rem;color:#72767d;margin-right:6px}
.txt{margin-top:3px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.att-img{max-width:280px;border-radius:8px;margin-top:5px;display:block}
.att-link{color:#00b0f4;display:block;margin-top:4px;font-size:.83rem}
.emb{background:#2b2d31;border-right:4px solid #5865F2;border-radius:4px;padding:9px 13px;margin-top:5px;max-width:500px}
.emb p{font-size:.86rem;margin-top:4px;white-space:pre-wrap}
.emb div{margin-top:6px;font-size:.84rem}
footer{text-align:center;padding:16px;font-size:.76rem;color:#72767d;border-top:1px solid #3f4147}
</style></head><body>
<header>
  <div><h1>📋 Transcript — #${esc(name)}</h1>
  <p>القسم: <b>${esc(section)}</b> | المالك: <b>${esc(owner)}</b> | الرسائل: <b>${msgs.length}</b> | ${new Date().toLocaleString('ar-EG')}</p></div>
  <span class="badge">Moaz Studio</span>
</header>
<div class="msgs">${rows||'<p style="text-align:center;color:#72767d;padding:40px">لا توجد رسائل</p>'}</div>
<footer>Moaz Studio Bot • ${new Date().getFullYear()}</footer>
</body></html>`;
}
EOF
echo -e "  ${GREEN}✔${NC} src/utils/transcript.ts"

# ══════════════════════════════════════════════════════════════
# 4) src/ticket/ticketSetup.ts  (wizard)
# ══════════════════════════════════════════════════════════════
cat > src/ticket/ticketSetup.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/ticket/ticketSetup.ts"

# ══════════════════════════════════════════════════════════════
# 5) src/ticket/ticketManager.ts
# ══════════════════════════════════════════════════════════════
cat > src/ticket/ticketManager.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/ticket/ticketManager.ts"

# ══════════════════════════════════════════════════════════════
# 6) src/commands/admin/ticket.ts
# ══════════════════════════════════════════════════════════════
cat > src/commands/admin/ticket.ts << 'EOF'
import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { runTicketSetup } from '../../ticket/ticketSetup';

export const data = new SlashCommandBuilder()
  .setName('ticket-setup')
  .setDescription('إعداد نظام التذاكر خطوة بخطوة')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await runTicketSetup(interaction);
}
EOF
echo -e "  ${GREEN}✔${NC} src/commands/admin/ticket.ts"

# ══════════════════════════════════════════════════════════════
# 7) src/commands/admin/send-panel-ticket.ts
# ══════════════════════════════════════════════════════════════
cat > src/commands/admin/send-panel-ticket.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/commands/admin/send-panel-ticket.ts"

# ══════════════════════════════════════════════════════════════
# 8) src/events/interactionCreate.ts
# ══════════════════════════════════════════════════════════════
cat > src/events/interactionCreate.ts << 'EOF'
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
EOF
echo -e "  ${GREEN}✔${NC} src/events/interactionCreate.ts"

# ══════════════════════════════════════════════════════════════
# 9) dashboard/views/tickets.ejs
# ══════════════════════════════════════════════════════════════
cat > dashboard/views/tickets.ejs << 'EOF'
<%- include('partials/header', { title: 'نظام التذاكر' }) %>

<div class="container-fluid px-4 py-4">
  <div class="d-flex align-items-center mb-4">
    <h2 class="mb-0">🎫 نظام التذاكر</h2>
  </div>

  <!-- Stats -->
  <div class="row g-3 mb-4">
    <div class="col-md-4">
      <div class="card text-center">
        <div class="card-body">
          <h3 class="text-primary"><%= stats.total %></h3>
          <p class="mb-0 text-muted">إجمالي التذاكر</p>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card text-center">
        <div class="card-body">
          <h3 class="text-success"><%= stats.open %></h3>
          <p class="mb-0 text-muted">مفتوحة</p>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card text-center">
        <div class="card-body">
          <h3 class="text-danger"><%= stats.closed %></h3>
          <p class="mb-0 text-muted">مغلقة</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Sections -->
  <div class="card mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="mb-0">أقسام التذاكر</h5>
    </div>
    <div class="card-body">
      <% if (config && config.sections && config.sections.length > 0) { %>
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead><tr>
              <th>القسم</th><th>الكاتيجوري</th><th>رول الستاف</th><th>قناة اللوق</th><th>الحالة</th>
            </tr></thead>
            <tbody>
              <% config.sections.forEach(s => { %>
              <tr>
                <td><%= s.emoji %> <%= s.name %></td>
                <td><code><%= s.categoryId %></code></td>
                <td><code><%= s.supportRoleId %></code></td>
                <td><code><%= s.logChannelId %></code></td>
                <td>
                  <% if (s.enabled) { %>
                    <span class="badge bg-success">مفعّل</span>
                  <% } else { %>
                    <span class="badge bg-secondary">معطّل</span>
                  <% } %>
                </td>
              </tr>
              <% }) %>
            </tbody>
          </table>
        </div>
      <% } else { %>
        <p class="text-muted text-center py-3">لا توجد أقسام. استخدم <code>/ticket-setup</code> في الديسكورد.</p>
      <% } %>
    </div>
  </div>

  <!-- Recent Tickets -->
  <div class="card">
    <div class="card-header"><h5 class="mb-0">آخر التذاكر</h5></div>
    <div class="card-body">
      <% if (tickets && tickets.length > 0) { %>
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead><tr>
              <th>#</th><th>المالك</th><th>القسم</th><th>الحالة</th><th>التاريخ</th>
            </tr></thead>
            <tbody>
              <% tickets.forEach(t => { %>
              <tr>
                <td><%= t.number.toString().padStart(4,'0') %></td>
                <td><%= t.ownerTag %></td>
                <td><%= t.sectionName %></td>
                <td>
                  <% if (t.status === 'open') { %>
                    <span class="badge bg-success">مفتوحة</span>
                  <% } else { %>
                    <span class="badge bg-danger">مغلقة</span>
                  <% } %>
                </td>
                <td><%= new Date(t.createdAt).toLocaleDateString('ar-EG') %></td>
              </tr>
              <% }) %>
            </tbody>
          </table>
        </div>
      <% } else { %>
        <p class="text-muted text-center py-3">لا توجد تذاكر بعد.</p>
      <% } %>
    </div>
  </div>
</div>

<%- include('partials/footer') %>
EOF
echo -e "  ${GREEN}✔${NC} dashboard/views/tickets.ejs"

# ══════════════════════════════════════════════════════════════
# 10) dashboard/routes/tickets.ts
# ══════════════════════════════════════════════════════════════
cat > dashboard/routes/tickets.ts << 'EOF'
import { Router, Request, Response } from 'express';
import { TicketConfig } from '../../src/models/TicketConfig';
import { Ticket }       from '../../src/models/Ticket';

const router = Router();

router.get('/:guildId/tickets', async (req: Request, res: Response) => {
  try {
    const { guildId } = req.params;
    const [config, tickets, total, open, closed] = await Promise.all([
      TicketConfig.findOne({ guildId }),
      Ticket.find({ guildId }).sort({ createdAt: -1 }).limit(50),
      Ticket.countDocuments({ guildId }),
      Ticket.countDocuments({ guildId, status: 'open' }),
      Ticket.countDocuments({ guildId, status: 'closed' }),
    ]);
    res.render('tickets', { config, tickets, stats: { total, open, closed }, guildId });
  } catch (err) {
    console.error('[tickets route]', err);
    res.status(500).send('Server Error');
  }
});

export default router;
EOF
echo -e "  ${GREEN}✔${NC} dashboard/routes/tickets.ts"

# ── Git
echo ""
echo -e "${YELLOW}📦 جاري عمل git commit...${NC}"
git add \
  src/models/TicketConfig.ts src/models/Ticket.ts \
  src/utils/transcript.ts \
  src/ticket/ticketSetup.ts src/ticket/ticketManager.ts \
  src/commands/admin/ticket.ts src/commands/admin/send-panel-ticket.ts \
  src/events/interactionCreate.ts \
  dashboard/views/tickets.ejs dashboard/routes/tickets.ts

git commit -m "feat: full ticket system v2 — wizard, panel, buttons, transcript, dashboard"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   ✅ تم تطبيق الـ Patch بنجاح!               ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}الخطوة الأخيرة:${NC} ${BOLD}git push${NC}"
echo ""
echo -e "  ${YELLOW}بعد الـ deploy:${NC}"
echo -e "  1️⃣  /ticket-setup     → إعداد الأقسام"
echo -e "  2️⃣  /send-panel-ticket → إرسال البانل"
echo ""
echo -e "  ${YELLOW}💾 Backup في:${NC} ${BACKUP}"
echo ""
