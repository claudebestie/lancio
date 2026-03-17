// ============================================================
// LANCIO — PIPELINE 100% AUTOMATIQUE
// Lobstr scraping → nettoyage → Brevo séquence → Supabase log
// Lancé chaque matin par GitHub Actions
// ============================================================

const { parse } = require('csv-parse/sync');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────

const LOBSTR_KEY   = process.env.LOBSTR_API_KEY;
const BREVO_KEY    = process.env.BREVO_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Crawler ID Google Maps — récupéré dynamiquement
let GMAPS_CRAWLER_ID = null;

async function getGMapsCrawlerId() {
  if (GMAPS_CRAWLER_ID) return GMAPS_CRAWLER_ID;
  const data = await lobstrGet('/crawlers/?limit=50');
  const results = data.results || data;
  log('Crawlers dispo : ' + results.map(c => `${c.name} (${c.id})`).join(' | '));
  const gmaps = results.find(c =>
    (c.name || '').toLowerCase().includes('google') ||
    (c.name || '').toLowerCase().includes('maps') ||
    (c.name || '').toLowerCase().includes('local') ||
    (c.name || '').toLowerCase().includes('place')
  );
  if (!gmaps) throw new Error('Crawler Google Maps non trouvé — voir crawlers dispo ci-dessus');
  GMAPS_CRAWLER_ID = gmaps.id;
  log(`Crawler Google Maps : ${gmaps.name} (${gmaps.id})`);
  return GMAPS_CRAWLER_ID;
}

// Planning des villes — le script prend automatiquement la suivante
const VILLES = [
  { ville: 'Lyon',       secteur: 'restaurant',    query: 'restaurant lyon' },
  { ville: 'Lyon',       secteur: 'coiffeur',       query: 'coiffeur lyon' },
  { ville: 'Bordeaux',   secteur: 'restaurant',    query: 'restaurant bordeaux' },
  { ville: 'Bordeaux',   secteur: 'artisan',        query: 'plombier bordeaux' },
  { ville: 'Toulouse',   secteur: 'restaurant',    query: 'restaurant toulouse' },
  { ville: 'Toulouse',   secteur: 'coiffeur',       query: 'coiffeur toulouse' },
  { ville: 'Nantes',     secteur: 'restaurant',    query: 'restaurant nantes' },
  { ville: 'Nantes',     secteur: 'artisan',        query: 'electricien nantes' },
  { ville: 'Marseille',  secteur: 'restaurant',    query: 'restaurant marseille' },
  { ville: 'Marseille',  secteur: 'coiffeur',       query: 'coiffeur marseille' },
  { ville: 'Strasbourg', secteur: 'restaurant',    query: 'restaurant strasbourg' },
  { ville: 'Strasbourg', secteur: 'artisan',        query: 'artisan strasbourg' },
  { ville: 'Lille',      secteur: 'restaurant',    query: 'restaurant lille' },
  { ville: 'Lille',      secteur: 'coiffeur',       query: 'coiffeur lille' },
];

const SENDER_EMAIL = 'margaux@lancio.fr';
const SENDER_NAME  = 'Margaux - Lancio';

// ── Helpers ───────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Brevo attend le format ISO
  return d.toISOString();
}

// ── Lobstr API ────────────────────────────────────────────────

async function lobstrGet(path) {
  const res = await fetch(`https://api.lobstr.io/v1${path}`, {
    headers: { 'Authorization': `Token ${LOBSTR_KEY}`, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Lobstr GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function lobstrPost(path, body) {
  const res = await fetch(`https://api.lobstr.io/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${LOBSTR_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Lobstr POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Crée (ou réutilise) un squid pour la query donnée
async function getOrCreateSquid(query) {
  const crawlerId = await getGMapsCrawlerId();
  const existing = await lobstrGet('/squids/?limit=50');
  const found = (existing.results || []).find(s => s.name === `lancio_${query}`);
  if (found) {
    log(`Squid existant réutilisé : ${found.id}`);
    return found.id;
  }

  const squid = await lobstrPost('/squids/', {
    crawler: crawlerId,
    name: `lancio_${query}`,
    params: {
      query,
      max_results: 200,
      language: 'fr',
      collect_contacts: true,
      country: 'France',
    },
  });
  log(`Squid créé : ${squid.id}`);
  return squid.id;
}

// Lance un run et attend la fin (polling toutes les 30s, max 20 min)
async function runAndWait(squidId) {
  log(`Lancement du run Lobstr pour squid ${squidId}...`);
  const run = await lobstrPost('/runs/', { squid: squidId });
  const runId = run.id || run.hash;
  log(`Run lancé : ${runId}`);

  const MAX_ATTEMPTS = 40; // 40 × 30s = 20 min max
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await sleep(30_000);
    const status = await lobstrGet(`/runs/${runId}/`);
    log(`Run status : ${status.status} (tentative ${i + 1}/${MAX_ATTEMPTS})`);

    if (status.status === 'done' || status.export_done) {
      log('Run terminé !');
      return runId;
    }
    if (status.status === 'error' || status.status === 'failed') {
      throw new Error(`Run Lobstr échoué : ${JSON.stringify(status)}`);
    }
  }
  throw new Error('Timeout : run Lobstr trop long (> 20 min)');
}

// Télécharge le CSV du run
async function downloadCSV(runId) {
  log(`Téléchargement CSV du run ${runId}...`);
  // D'abord récupérer le download URL
  const info = await lobstrGet(`/runs/${runId}/`);
  const downloadUrl = info.download_url || info.result_url;

  if (!downloadUrl) {
    // Fallback : endpoint direct
    const res = await fetch(`https://api.lobstr.io/v1/runs/${runId}/download`, {
      headers: { 'Authorization': `Token ${LOBSTR_KEY}` },
    });
    if (!res.ok) throw new Error(`Download CSV → ${res.status}`);
    return res.text();
  }

  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Download CSV (url) → ${res.status}`);
  return res.text();
}

// Parse et nettoie le CSV Lobstr
function parseAndClean(csvText) {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });

  const seen = new Set();
  const clean = [];

  for (const r of records) {
    const email = (r['EMAIL'] || r['email'] || '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    clean.push({
      email,
      nom: (r['NAME'] || r['name'] || '').trim(),
      city: (r['CITY'] || r['INPUT CITY'] || '').trim(),
    });
  }

  log(`CSV parsé : ${records.length} lignes brutes → ${clean.length} emails valides`);
  return clean;
}

// ── Brevo API ─────────────────────────────────────────────────

async function brevo(endpoint, method = 'GET', body) {
  const res = await fetch(`https://api.brevo.com/v3${endpoint}`, {
    method,
    headers: {
      'api-key': BREVO_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Brevo ${method} ${endpoint}: ${JSON.stringify(data)}`);
  return data;
}

// Crée les templates au premier run, réutilise ensuite
async function ensureTemplates() {
  const existing = await brevo('/smtp/templates?templateStatus=true&limit=50');
  const map = {};
  for (const t of (existing.templates || [])) map[t.name] = t.id;

  const defs = [
    {
      name: 'lancio_j0',
      subject: 'Votre site, {{params.VILLE}}',
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;max-width:500px;margin:0 auto;padding:24px">
<p>Bonjour,</p>
<p>J'ai vu que <strong>{{params.NOM}}</strong> n'avait pas encore de site professionnel — ou que celui que j'ai trouvé date un peu.</p>
<p>Chez Lancio on crée des sites vitrines en 48h pour <strong>650€ tout compris</strong>, sans rendez-vous, sans abonnement.</p>
<p>Est-ce que ça vaut 5 minutes cette semaine ?</p>
<p>Margaux<br><a href="https://lancio.fr">lancio.fr</a><br><a href="https://calendly.com/lancio/audit">Réserver un appel gratuit →</a></p>
<p style="font-size:11px;color:#aaa;margin-top:32px"><a href="{{unsubscribeLink}}">Se désinscrire</a></p>
</body></html>`,
    },
    {
      name: 'lancio_j3',
      subject: 'Re: Votre site, {{params.VILLE}}',
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;max-width:500px;margin:0 auto;padding:24px">
<p>Bonjour,</p>
<p>Je me permets de revenir — je ne sais pas si mon email précédent est passé.</p>
<p>On a livré plusieurs sites à des <strong>{{params.SECTEUR}}s</strong> cette semaine. Si vous voulez voir des exemples : <a href="https://lancio.fr">lancio.fr</a></p>
<p>Margaux · <a href="https://calendly.com/lancio/audit">Appel 15 min offert</a></p>
<p style="font-size:11px;color:#aaa;margin-top:32px"><a href="{{unsubscribeLink}}">Se désinscrire</a></p>
</body></html>`,
    },
    {
      name: 'lancio_j7',
      subject: 'Dernière nouvelle de ma part',
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;max-width:500px;margin:0 auto;padding:24px">
<p>Bonjour,</p>
<p>Je ne veux pas vous encombrer — c'est mon dernier email.</p>
<p>Si un site professionnel en 48h pour 650€ peut vous intéresser un jour, <a href="https://lancio.fr">lancio.fr</a> est là.</p>
<p>Bonne continuation,<br>Margaux</p>
<p style="font-size:11px;color:#aaa;margin-top:32px"><a href="{{unsubscribeLink}}">Se désinscrire</a></p>
</body></html>`,
    },
  ];

  const ids = {};
  for (const d of defs) {
    if (map[d.name]) {
      ids[d.name] = map[d.name];
      log(`Template "${d.name}" déjà existant (id: ${map[d.name]})`);
    } else {
      const r = await brevo('/smtp/templates', 'POST', {
        name: d.name,
        subject: d.subject,
        htmlContent: d.html,
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        isActive: true,
      });
      ids[d.name] = r.id;
      log(`Template "${d.name}" créé (id: ${r.id})`);
    }
  }
  return ids;
}

async function createList(name) {
  const r = await brevo('/contacts/lists', 'POST', { name, folderId: 7 });
  return r.id;
}

async function importContacts(contacts, listId, ville, secteur) {
  const BATCH = 150;
  let total = 0;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH).map(c => ({
      email: c.email,
      attributes: { NOM: c.nom || c.email, VILLE: ville, SECTEUR: secteur },
      listIds: [listId],
      updateEnabled: true,
    }));
    await brevo('/contacts/import', 'POST', { updateEnabled: true, jsonBody: batch });
    total += batch.length;
    log(`Import Brevo : ${total}/${contacts.length}`);
  }
  return total;
}

async function scheduleCampaigns(listId, tplIds, ville, secteur, tag) {
  const seq = [
    { name: `lancio_j0_${tag}`, tpl: tplIds['lancio_j0'], days: 0 },
    { name: `lancio_j3_${tag}`, tpl: tplIds['lancio_j3'], days: 3 },
    { name: `lancio_j7_${tag}`, tpl: tplIds['lancio_j7'], days: 7 },
  ];
  const created = [];
  for (const s of seq) {
    const r = await brevo('/emailCampaigns', 'POST', {
      name: s.name,
      templateId: s.tpl,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      recipients: { listIds: [listId] },
      scheduledAt: addDays(s.days),
    });
    log(`Campagne planifiée : ${s.name} (J+${s.days})`);
    created.push({ name: s.name, id: r.id, days: s.days });
  }
  return created;
}

// ── Supabase ──────────────────────────────────────────────────

async function logRun(entry) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await sb.from('lancio_pipeline_logs').insert([entry]);
  if (error) throw new Error(`Supabase : ${error.message}`);
  log('Log Supabase ✓');
}

async function getNextVille() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await sb.from('lancio_pipeline_logs').select('ville, secteur');
  const done = new Set((data || []).map(r => `${r.ville}_${r.secteur}`));
  const next = VILLES.find(v => !done.has(`${v.ville}_${v.secteur}`));
  return next || null;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  log('=== LANCIO PIPELINE START ===');

  // 1. Prochaine ville
  const target = await getNextVille();
  if (!target) {
    log('✓ Toutes les villes ont été traitées. Planning terminé !');
    process.exit(0);
  }
  const { ville, secteur, query } = target;
  const tag = `${ville}_${secteur}_${new Date().toISOString().split('T')[0]}`.toLowerCase().replace(/ /g, '_');
  log(`Ville du jour : ${ville} / ${secteur} (query: "${query}")`);

  // 2. Lobstr : squid + run + CSV
  const squidId = await getOrCreateSquid(query);
  const runId   = await runAndWait(squidId);
  const csvText = await downloadCSV(runId);
  const contacts = parseAndClean(csvText);

  if (contacts.length === 0) {
    log('Aucun contact valide. On log quand même et on passe à la prochaine ville demain.');
    await logRun({
      run_id: tag, ville, secteur,
      contacts_total: 0, contacts_imported: 0,
      lobstr_run_id: runId, status: 'no_contacts',
      created_at: new Date().toISOString(),
    });
    process.exit(0);
  }

  // 3. Brevo : templates + liste + import + campagnes
  const tplIds   = await ensureTemplates();
  const listName = `lancio_${tag}`;
  const listId   = await createList(listName);
  log(`Liste Brevo : "${listName}" (id: ${listId})`);

  const imported  = await importContacts(contacts, listId, ville, secteur);
  const campaigns = await scheduleCampaigns(listId, tplIds, ville, secteur, tag);

  // 4. Log Supabase
  await logRun({
    run_id: tag,
    ville,
    secteur,
    contacts_total: contacts.length,
    contacts_imported: imported,
    lobstr_run_id: runId,
    brevo_list_id: listId,
    brevo_list_name: listName,
    campaigns: JSON.stringify(campaigns),
    status: 'success',
    created_at: new Date().toISOString(),
  });

  log('');
  log('════════════════════════════════════════');
  log(`✓ Pipeline terminé — ${ville} / ${secteur}`);
  log(`  Contacts importés   : ${imported}`);
  log(`  Campagnes planifiées: J0 / J+3 / J+7`);
  log(`  Prochaine ville     : voir planning`);
  log('════════════════════════════════════════');
}

main().catch(err => {
  console.error('PIPELINE ERROR:', err.message);
  process.exit(1);
});
