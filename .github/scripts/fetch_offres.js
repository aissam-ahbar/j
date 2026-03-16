import fs from 'fs';
import fetch from 'node-fetch';

const CLIENT_ID = process.env.FT_CLIENT_ID;
const CLIENT_SECRET = process.env.FT_CLIENT_SECRET;

// Fichier JSON final
const OUTPUT_FILE = './offres.json';

// Timeout entre chaque batch pour être sûr de ne pas dépasser le quota
const TIMEOUT_MS = 200; // 5 appels/sec max → 200ms

// Métropole de Montpellier (toutes les communes de l'agglomération)
const COMMUNES_MONTPELLIER = [
  "34172", "34070", "34110", "34120", "34090", "34130", "34000", "34270", "34370"
];

// Max résultats par batch
const RANGE_SIZE = 149;

// Date minimale = 24h
function getDate24hAgoISO() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// Authentification Client Credentials
async function getToken() {
  const res = await fetch('https://api.francetravail.fr/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    })
  });
  const data = await res.json();
  return data.access_token;
}

// Appel API France Travail
async function fetchOffres(token, start = 0) {
  const params = new URLSearchParams({
    range: `${start}-${start + RANGE_SIZE - 1}`,
    minCreationDate: getDate24hAgoISO(),
    commune: COMMUNES_MONTPELLIER.join(','),
    accesTravailleurHandicape: 'true'
  });

  const res = await fetch(`https://api.francetravail.fr/offres/v2?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`API Error: ${err.codeErreur} - ${err.message}`);
  }

  const data = await res.json();
  return data.resultats || [];
}

// Mapping pour ton front / IA
function mapOffre(offre) {
  return {
    id: offre.id,
    intitule: offre.intitule,
    description: offre.description,
    dateActualisation: offre.dateActualisation,
    lieuTravail: {
      latitude: offre.lieuTravail.latitude,
      longitude: offre.lieuTravail.longitude,
      commune: offre.lieuTravail.commune
    },
    romeCode: offre.romeCode,
    competences: offre.competences,
    formations: offre.formations || [],
    typeContrat: offre.typeContrat,
    experienceExige: offre.experienceExige,
    experienceLibelle: offre.experienceLibelle,
    alternance: offre.alternance,
    accessibleTH: offre.accessibleTH,
    employeurHandiEngage: offre.employeurHandiEngage,
    nombrePostes: offre.nombrePostes,
    salaire: offre.salaire || null,
    urlPostulation: offre.contact?.coordonnees1 || offre.entreprise?.url || ''
  };
}

// Cron principal
async function runCron() {
  try {
    const token = await getToken();
    let allOffres = [];
    let start = 0;

    while (true) {
      const batch = await fetchOffres(token, start);
      if (batch.length === 0) break;

      // Mapping
      const mapped = batch.map(mapOffre);
      allOffres.push(...mapped);

      // Timeout entre batches
      await new Promise(r => setTimeout(r, TIMEOUT_MS));

      start += RANGE_SIZE;
    }

    // Sauvegarde dans un JSON unique (écrase le précédent)
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffres, null, 2), 'utf-8');
    console.log(`✅ ${allOffres.length} offres sauvegardées dans ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('❌ Cron échoué:', err.message);
  }
}

// Lancer le cron
runCron();
