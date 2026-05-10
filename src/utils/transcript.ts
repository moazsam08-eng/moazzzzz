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
