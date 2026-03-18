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

function checkEnv() {
  const missing = [];
  if (!LOBSTR_KEY)   missing.push('LOBSTR_API_KEY');
  if (!BREVO_KEY)    missing.push('BREVO_API_KEY');
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_KEY');
  if (missing.length) {
    console.error(`Variables d'env manquantes : ${missing.join(', ')}`);
    process.exit(1);
  }
}

let sb = null;
function getSb() {
  if (!sb) sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return sb;
}

// Google Maps Leads Scraper crawler ID
const GMAPS_CRAWLER_ID = '4734d096159ef05210e0e1677e8be823';

// Planning : ville + secteur + catégorie Google Maps
const VILLES = [
  { ville: 'Lyon',       secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Lyon',       secteur: 'coiffeur',   category: 'coiffeur' },
  { ville: 'Bordeaux',   secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Bordeaux',   secteur: 'artisan',    category: 'plombier' },
  { ville: 'Toulouse',   secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Toulouse',   secteur: 'coiffeur',   category: 'coiffeur' },
  { ville: 'Nantes',     secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Nantes',     secteur: 'artisan',    category: 'electricien' },
  { ville: 'Marseille',  secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Marseille',  secteur: 'coiffeur',   category: 'coiffeur' },
  { ville: 'Strasbourg', secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Strasbourg', secteur: 'artisan',    category: 'artisan' },
  { ville: 'Lille',      secteur: 'restaurant', category: 'restaurant' },
  { ville: 'Lille',      secteur: 'coiffeur',   category: 'coiffeur' },
];

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@lancio.fr';
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
  return d.toISOString();
}

// ── Lobstr API (v1, sans trailing slashes) ───────────────────

async function lobstrGet(path) {
  const url = `https://api.lobstr.io/v1${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Token ${LOBSTR_KEY}`, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lobstr GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function lobstrPost(path, body) {
  const url = `https://api.lobstr.io/v1${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${LOBSTR_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lobstr POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Crée (ou réutilise) un squid pour la ville/catégorie
async function getOrCreateSquid(ville, category) {
  const squidName = `lancio_${ville}_${category}`.toLowerCase().replace(/ /g, '_');

  // Chercher un squid existant
  const existing = await lobstrGet('/squids');
  const found = (existing.data || []).find(s => s.name === squidName);
  if (found) {
    log(`Squid existant réutilisé : ${found.id} (${squidName})`);
    return found.id;
  }

  // Créer un nouveau squid avec params France
  const squid = await lobstrPost('/squids', {
    crawler: GMAPS_CRAWLER_ID,
    name: squidName,
  });
  log(`Squid créé : ${squid.id} (${squidName})`);

  // Configurer les paramètres du squid
  await lobstrPost(`/squids/${squid.id}`, {
    params: {
      country: 'France',
      language: 'Français (France)',
      max_results: 200,
      functions: {
        collect_contacts: true,
        details: false,
        images: false,
      },
    },
  });
  log('Params squid configurés (France, French, collect_contacts)');

  return squid.id;
}

// Ajoute les tasks (ville+catégorie) au squid
async function addTasks(squidId, ville, category) {
  log(`Ajout task : ${category} à ${ville}, France`);
  const result = await lobstrPost('/tasks', {
    squid: squidId,
    tasks: [{
      city: ville,
      country: 'France',
      category: category,
    }],
  });
  log(`Tasks ajoutées : ${result.inserted || 0} (dupes: ${result.duplicates || 0})`);
  return result;
}

// Lance un run et attend la fin (polling toutes les 30s, max 20 min)
async function runAndWait(squidId) {
  log(`Lancement du run Lobstr pour squid ${squidId}...`);
  const run = await lobstrPost('/runs', { squid: squidId });
  const runId = run.id;
  log(`Run lancé : ${runId}`);

  const MAX_ATTEMPTS = 40; // 40 × 30s = 20 min max
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await sleep(30_000);
    const status = await lobstrGet(`/runs/${runId}`);
    log(`Run status : ${status.status} (${i + 1}/${MAX_ATTEMPTS}) — ${status.total_results || 0} résultats`);

    if (status.status === 'done') {
      log(`Run terminé ! ${status.total_results || 0} résultats, durée: ${Math.round(status.duration || 0)}s`);
      // Attendre que l'export soit prêt
      if (!status.export_done) {
        log('Export en cours...');
        await sleep(10_000);
      }
      return runId;
    }
    if (status.status === 'error' || status.status === 'aborted') {
      throw new Error(`Run Lobstr échoué : ${status.status} — ${status.done_reason || 'raison inconnue'}`);
    }
  }
  throw new Error('Timeout : run Lobstr trop long (> 20 min)');
}

// Télécharge le CSV du run
async function downloadCSV(runId) {
  log(`Téléchargement CSV du run ${runId}...`);

  // L'endpoint /download retourne une URL signée S3
  const res = await fetch(`https://api.lobstr.io/v1/runs/${runId}/download`, {
    headers: { 'Authorization': `Token ${LOBSTR_KEY}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Download CSV → ${res.status}: ${body}`);
  }

  // La réponse peut être l'URL directement ou un JSON avec url
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json();
    const downloadUrl = data.s3 || data.url || data.download_url;
    if (!downloadUrl) throw new Error(`Pas d'URL de téléchargement. Réponse: ${JSON.stringify(data).slice(0, 200)}`);
    log(`URL de téléchargement : ${downloadUrl.slice(0, 80)}...`);
    const csvRes = await fetch(downloadUrl);
    if (!csvRes.ok) throw new Error(`Download CSV (S3) → ${csvRes.status}`);
    return csvRes.text();
  }

  // Sinon c'est directement le CSV
  return res.text();
}

// Parse et nettoie le CSV Lobstr
function parseAndClean(csvText) {
  if (!csvText || !csvText.trim()) {
    log('CSV vide reçu');
    return [];
  }

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  log(`Colonnes CSV : ${Object.keys(records[0] || {}).join(', ')}`);

  const seen = new Set();
  const clean = [];

  for (const r of records) {
    // Lobstr Google Maps peut utiliser différents noms de colonnes
    const email = (r['email'] || r['EMAIL'] || r['Email'] || r['e-mail'] || r['contact_email'] || '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    clean.push({
      email,
      nom: (r['name'] || r['NAME'] || r['Name'] || r['title'] || '').trim(),
      city: (r['city'] || r['CITY'] || r['input_city'] || r['INPUT CITY'] || '').trim(),
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
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Brevo ${method} ${endpoint} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

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
<p>Chez Lancio on crée des sites vitrines en 48h pour <strong>650&euro; tout compris</strong>, sans rendez-vous, sans abonnement.</p>
<p>Est-ce que ça vaut 5 minutes cette semaine ?</p>
<p>Margaux<br><a href="https://lancio.fr">lancio.fr</a><br><a href="https://calendly.com/lancio/audit">Réserver un appel gratuit</a></p>
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
<p>Si un site professionnel en 48h pour 650&euro; peut vous intéresser un jour, <a href="https://lancio.fr">lancio.fr</a> est là.</p>
<p>Bonne continuation,<br>Margaux</p>
<p style="font-size:11px;color:#aaa;margin-top:32px"><a href="{{unsubscribeLink}}">Se désinscrire</a></p>
</body></html>`,
    },
  ];

  const ids = {};
  for (const d of defs) {
    if (map[d.name]) {
      ids[d.name] = map[d.name];
      log(`Template "${d.name}" existant (id: ${map[d.name]})`);
    } else {
      const r = await brevo('/smtp/templates', 'POST', {
        templateName: d.name,
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

async function getOrCreateFolder() {
  const { folders } = await brevo('/contacts/folders?limit=50&offset=0');
  const existing = (folders || []).find(f => f.name === 'Lancio Pipeline');
  if (existing) return existing.id;
  const r = await brevo('/contacts/folders', 'POST', { name: 'Lancio Pipeline' });
  log(`Dossier Brevo "Lancio Pipeline" créé (id: ${r.id})`);
  return r.id;
}

async function createList(name) {
  const folderId = await getOrCreateFolder();
  const r = await brevo('/contacts/lists', 'POST', { name, folderId });
  return r.id;
}

async function importContacts(contacts, listId, ville, secteur) {
  const BATCH = 150;
  let total = 0;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH).map(c => ({
      email: c.email,
      attributes: { NOM: c.nom || c.email, VILLE: ville, SECTEUR: secteur },
    }));
    await brevo('/contacts/import', 'POST', {
      listIds: [listId],
      updateEnabled: true,
      jsonBody: batch,
    });
    total += batch.length;
    log(`Import Brevo : ${total}/${contacts.length}`);
  }
  return total;
}

async function scheduleCampaigns(listId, tplIds, ville, secteur, tag) {
  const seq = [
    { name: `lancio_j0_${tag}`, tpl: tplIds['lancio_j0'], days: 0, subject: `Votre site, ${ville}` },
    { name: `lancio_j3_${tag}`, tpl: tplIds['lancio_j3'], days: 3, subject: `Re: Votre site, ${ville}` },
    { name: `lancio_j7_${tag}`, tpl: tplIds['lancio_j7'], days: 7, subject: 'Dernière nouvelle de ma part' },
  ];
  const created = [];
  for (const s of seq) {
    const scheduledAt = addDays(s.days);
    const r = await brevo('/emailCampaigns', 'POST', {
      name: s.name,
      templateId: s.tpl,
      subject: s.subject,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      recipients: { listIds: [listId] },
      scheduledAt,
    });
    log(`Campagne planifiée : ${s.name} (J+${s.days})`);
    created.push({ name: s.name, id: r.id, days: s.days });
  }
  return created;
}

// ── Supabase ──────────────────────────────────────────────────

async function logRun(entry) {
  if (typeof entry.campaigns === 'string') {
    try { entry.campaigns = JSON.parse(entry.campaigns); } catch {}
  }

  const { error } = await getSb().from('lancio_pipeline_logs').insert([entry]);
  if (error) {
    console.error(`Supabase logRun error: ${error.message}`);
    console.error('→ Exécuter le SQL dans supabase/create-pipeline-logs.sql');
    return;
  }
  log('Log Supabase OK');
}

async function getNextVille() {
  const { data, error } = await getSb().from('lancio_pipeline_logs').select('ville, secteur');
  if (error) {
    log(`Supabase warning: ${error.message} — on commence depuis Lyon.`);
    return VILLES[0];
  }
  const done = new Set((data || []).map(r => `${r.ville}_${r.secteur}`));
  const next = VILLES.find(v => !done.has(`${v.ville}_${v.secteur}`));
  return next || null;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  checkEnv();
  log('=== LANCIO PIPELINE START ===');

  // 1. Prochaine ville
  const target = await getNextVille();
  if (!target) {
    log('Toutes les villes ont été traitées. Planning terminé !');
    process.exit(0);
  }
  const { ville, secteur, category } = target;
  const tag = `${ville}_${secteur}_${new Date().toISOString().split('T')[0]}`.toLowerCase().replace(/ /g, '_');
  log(`Ville du jour : ${ville} / ${secteur} (catégorie Maps: "${category}")`);

  let runId = null;

  try {
    // 2. Lobstr : squid + tasks + run + CSV
    const squidId = await getOrCreateSquid(ville, category);
    await addTasks(squidId, ville, category);
    runId = await runAndWait(squidId);
    const csvText = await downloadCSV(runId);
    const contacts = parseAndClean(csvText);

    if (contacts.length === 0) {
      log('Aucun contact avec email valide trouvé.');
      await logRun({
        run_id: tag, ville, secteur,
        contacts_total: 0, contacts_imported: 0,
        lobstr_run_id: String(runId), status: 'no_contacts',
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
      run_id: tag, ville, secteur,
      contacts_total: contacts.length,
      contacts_imported: imported,
      lobstr_run_id: String(runId),
      brevo_list_id: listId,
      brevo_list_name: listName,
      campaigns,
      status: 'success',
    });

    log('');
    log('========================================');
    log(`Pipeline terminé — ${ville} / ${secteur}`);
    log(`  Contacts importés   : ${imported}`);
    log(`  Campagnes planifiées: J0 / J+3 / J+7`);
    log('========================================');

  } catch (err) {
    console.error(`PIPELINE ERROR: ${err.message}`);
    await logRun({
      run_id: tag, ville, secteur,
      contacts_total: 0, contacts_imported: 0,
      lobstr_run_id: runId ? String(runId) : null,
      status: 'error',
      error_message: err.message.slice(0, 500),
    }).catch(() => {});
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
