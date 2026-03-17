// scripts/fetch_offres.js
import fs from 'fs';
import fetch from 'node-fetch';

// ⚡ Utilitaire pour ISO-8601 sans millisecondes
function isoWithoutMilliseconds(date) {
  return date.toISOString().split('.')[0] + 'Z';
}

// 🔹 Paramètres
const commune = '34172'; // exemple : Montpellier
const distance = process.env.FT_DISTANCE || 207;

// ⚡ Dates : dernière 24h
const minDate = isoWithoutMilliseconds(new Date(Date.now() - 24 * 60 * 60 * 1000));
const maxDate = isoWithoutMilliseconds(new Date());

// 🔹 URL finale
const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?commune=${commune}&distance=${distance}&minCreationDate=${minDate}&maxCreationDate=${maxDate}&range=0-149`;

// 🔹 Fonction pour récupérer le token Bearer depuis client_id / client_secret
async function getBearerToken() {
  const clientId = process.env.FT_CLIENT_ID;
  const clientSecret = process.env.FT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FT_CLIENT_ID et FT_CLIENT_SECRET sont requis !');
  }

  const tokenResp = await fetch('https://api.francetravail.io/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new Error(`Erreur token OAuth : ${text}`);
  }

  const data = await tokenResp.json();
  return data.access_token;
}

// 🔹 Fonction principale
async function fetchOffres() {
  try {
    const token = await getBearerToken();

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Erreur API France Travail : ${text}`);
    }

    const json = await resp.json();

    // Créer dossier data si nécessaire
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');

    // Sauvegarder JSON
    fs.writeFileSync('./data/ft-offres.json', JSON.stringify(json, null, 2));

    console.log(`✅ Offres récupérées : ${json.length || Object.keys(json).length}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// 🔹 Lancer
fetchOffres();
