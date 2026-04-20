// Netlify Function — brief submit
// 1. Insert lancio_orders Supabase
// 2. Email confirmation au client
// 3. Email notif à hello@lancio.fr

const SUPABASE_URL = 'https://rofkgmwjggvxlgrdnsyt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZmtnbXdqZ2d2eGxncmRuc3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzA2MTgsImV4cCI6MjA4NzUwNjYxOH0.6nlnX-0wUlID-630j5fOyveEAG0Lrp2gWhgGMRKpmNk';
const NOTIF_TO = 'hello@lancio.fr';

const OFFRE_LABELS = {
  audit: 'Audit · 150€',
  refonte: 'Refonte page · 700€',
  site: 'Site complet · 1200€',
  indecis: 'À déterminer ensemble',
};

const esc = (s) => String(s || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

async function sendBrevo(payload) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, status: 0, error: 'BREVO_API_KEY missing' };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    return { ok: r.ok, status: r.status, body: txt.substring(0, 300) };
  } catch (e) { return { ok: false, status: 0, error: String(e) }; }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'bad json' }) }; }

  const { nom, email, tel = '', secteur, entreprise, domaine = '', description, offre } = d;
  if (!nom || !email || !secteur || !entreprise || !description || !offre) {
    return { statusCode: 400, body: JSON.stringify({ error: 'champs manquants' }) };
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/lancio_orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
    body: JSON.stringify({ nom, email, tel, secteur, entreprise, domaine, description, options: [offre], maintenance: false, options_total: 0, status: 'new' }),
  });
  if (!insertRes.ok) {
    console.error('Supabase insert', insertRes.status, await insertRes.text());
    return { statusCode: 500, body: JSON.stringify({ error: 'insert failed' }) };
  }

  const offreLabel = OFFRE_LABELS[offre] || offre;
  const prenom = nom.trim().split(/\s+/)[0] || nom;

  const clientMail = {
    sender: { name: 'Margaux — Lancio', email: NOTIF_TO },
    to: [{ email, name: nom }],
    replyTo: { email: NOTIF_TO, name: 'Margaux — Lancio' },
    subject: 'Ton brief est bien arrivé — je reviens vers toi sous 2h',
    htmlContent: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:15px;line-height:1.7;">
<p>Salut ${esc(prenom)},</p>
<p>Ton brief est bien arrivé. Je l'ouvre, je te réponds <strong>sous 2h</strong> avec un devis précis et les prochaines étapes.</p>
<div style="padding:14px 18px;background:#fef7f2;border-left:3px solid #E8622C;color:#5a5a55;margin:18px 0;font-size:14px;">
<strong>Offre visée :</strong> ${esc(offreLabel)}<br/>
<strong>Entreprise :</strong> ${esc(entreprise)}
</div>
<p>Pas de paiement à cette étape — tu valides le devis d'abord.</p>
<p>À très vite,<br/>Margaux · Lancio</p>
<p style="font-size:12px;color:#999;margin-top:36px;">Une question ? Réponds à ce mail ou écris à hello@lancio.fr</p>
</div>`,
  };

  const notifMail = {
    sender: { name: 'Lancio Bot', email: NOTIF_TO },
    to: [{ email: NOTIF_TO }],
    replyTo: { email, name: nom },
    subject: `🔔 Nouveau brief — ${entreprise} (${offreLabel})`,
    htmlContent: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.7;">
<p><strong>${esc(nom)}</strong> — ${esc(email)}${tel ? ' — ' + esc(tel) : ''}</p>
<p><strong>Secteur :</strong> ${esc(secteur)}<br/>
<strong>Entreprise :</strong> ${esc(entreprise)}<br/>
<strong>Domaine :</strong> ${domaine ? esc(domaine) : '—'}<br/>
<strong>Offre :</strong> ${esc(offreLabel)}</p>
<p><strong>Description :</strong><br/>${esc(description).replace(/\n/g, '<br/>')}</p>
<p style="margin-top:20px;"><a href="https://lancio-mizra-bo.netlify.app" style="color:#E8622C;">→ Ouvrir le BO</a></p>
</div>`,
  };

  const [clientResult, notifResult] = await Promise.all([sendBrevo(clientMail), sendBrevo(notifMail)]);
  const debug = event.queryStringParameters?.debug === '1';

  return { statusCode: 200, body: JSON.stringify(debug ? { ok: true, client: clientResult, notif: notifResult } : { ok: true }) };
};
