// scripts/fetch_offres.js
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// ⚠️ Utiliser des variables d'environnement pour cacher tes credentials
const CLIENT_ID = process.env.FT_CLIENT_ID;
const CLIENT_SECRET = process.env.FT_CLIENT_SECRET;

const OUTPUT_FILE = './data/ft-offres.json';
const TIMEOUT_MS = 200; // 5 appels/sec max → 200ms

// Toutes les communes de la métropole de Montpellier
const COMMUNES_MONTPELLIER = [
  "34172","34070","34110","34120","34090","34130","34000","34270","34370"
];

// Limite API : max 5 communes par recherche
const MAX_COMMUNES_PAR_BATCH = 5;

// Max résultats par batch
const RANGE_SIZE = 149;

// Date minimale = 24h (format ISO sans millisecondes)
function getDate24hAgoISO() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Authentification Client Credentials
async function getToken() {
  const res = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'o2dsoffre api_offresdemploiv2'
    })
  });

  const text = await res.text();
  const data = JSON.parse(text);
  return data.access_token;
}

// Appel API France Travail pour un batch de communes
async function fetchOffres(token, communesBatch, start = 0) {
  const params = new URLSearchParams({
    range: `${start}-${start + RANGE_SIZE - 1}`,
    minCreationDate: getDate24hAgoISO(),
    maxCreationDate: getDate24hAgoISO(),
    commune: communesBatch.join(','),
    accesTravailleurHandicape: 'true'
  });

  const res = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const text = await res.text();
  try {
    return JSON.parse(text).resultats || [];
  } catch (err) {
    console.warn(`⚠️ Réponse vide ou non JSON pour communes [${communesBatch.join(',')}] start=${start}`);
    return [];
  }
}

// Mapping pour ton front / IA
function mapOffre(offre) {
  return {
    id: offre.id,
    intitule: offre.intitule,
    description: offre.description,
    dateActualisation: offre.dateActualisation,
    lieuTravail: {
      latitude: offre.lieuTravail?.latitude,
      longitude: offre.lieuTravail?.longitude,
      commune: offre.lieuTravail?.commune
    },
    romeCode: offre.romeCode,
    competences: offre.competences || [],
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

    for (let i = 0; i < COMMUNES_MONTPELLIER.length; i += MAX_COMMUNES_PAR_BATCH) {
      const communesBatch = COMMUNES_MONTPELLIER.slice(i, i + MAX_COMMUNES_PAR_BATCH);
      let start = 0;

      while (true) {
        const batch = await fetchOffres(token, communesBatch, start);
        if (batch.length === 0) break;

        const mapped = batch.map(mapOffre);
        allOffres.push(...mapped);

        await new Promise(r => setTimeout(r, TIMEOUT_MS));
        start += RANGE_SIZE;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffres, null, 2), 'utf-8');
    console.log(`✅ ${allOffres.length} offres sauvegardées dans ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('❌ Cron échoué:', err.message);
  }
}

// Lancer le cron
runCron();
