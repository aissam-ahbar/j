// scripts/fetch_offres_debug.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.FT_CLIENT_ID;
const CLIENT_SECRET = process.env.FT_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ FT_CLIENT_ID et FT_CLIENT_SECRET doivent être définis dans .env");
  process.exit(1);
}

const OUTPUT_FILE = "./data/ft-offres.json";
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);
const TIMEOUT_MS = 200; // 5 appels/sec max
const RANGE_SIZE = 149;
const DISTANCE = process.env.FT_DISTANCE || "207";

// Crée le dossier ./data si nécessaire
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Dossier créé: ${OUTPUT_DIR}`);
}

const COMMUNES_MONTPELLIER = [
  "34172", "34070", "34110", "34120", "34090", "34130", "34000", "34270", "34370"
];

const MIN_DATE = process.env.FT_MIN_DATE || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const MAX_DATE = process.env.FT_MAX_DATE || new Date().toISOString();

async function getToken() {
  const res = await fetch(
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "o2dsoffre api_offresdemploiv2",
      }),
    }
  );

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log("🔑 Token récupéré avec succès");
    return data.access_token;
  } catch (err) {
    console.error("❌ Erreur token:", text);
    throw err;
  }
}

function splitCommunes(communes) {
  const chunks = [];
  for (let i = 0; i < communes.length; i += 5) {
    chunks.push(communes.slice(i, i + 5));
  }
  return chunks;
}

async function fetchOffres(token, communesBatch, start = 0) {
  const params = new URLSearchParams({
    range: `${start}-${start + RANGE_SIZE - 1}`,
    minCreationDate: MIN_DATE,
    maxCreationDate: MAX_DATE,
    commune: communesBatch.join(","),
    distance: DISTANCE,
    accesTravailleurHandicape: "true",
  });

  const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params.toString()}`;

  // Log info détaillée
  console.log("---------------------------------------------------------");
  console.log(`📍 Fetching communes: [${communesBatch.join(",")}]`);
  console.log(`🕒 start=${start}, range=${start}-${start+RANGE_SIZE-1}`);
  console.log(`📅 minCreationDate=${MIN_DATE}`);
  console.log(`📅 maxCreationDate=${MAX_DATE}`);
  console.log(`🌐 distance=${DISTANCE}`);
  console.log("📜 Equivalent curl:");
  console.log(`curl -X GET "${url}" \\`);
  console.log(`-H "Authorization: Bearer ${token}" \\`);
  console.log(`-H "Accept: application/json"\n`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!text || text.trim() === "") {
    console.warn(`⚠️ Réponse vide pour communes [${communesBatch.join(",")}] start=${start}`);
    return [];
  }

  try {
    const json = JSON.parse(text);
    console.log(`✅ ${json.resultats?.length || 0} offres récupérées dans ce batch`);
    return json.resultats || [];
  } catch (err) {
    console.error("❌ Réponse API non JSON:", text);
    return [];
  }
}

function mapOffre(offre) {
  return {
    id: offre.id,
    intitule: offre.intitule,
    description: offre.description,
    dateActualisation: offre.dateActualisation,
    lieuTravail: {
      latitude: offre.lieuTravail?.latitude,
      longitude: offre.lieuTravail?.longitude,
      commune: offre.lieuTravail?.commune,
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
    urlPostulation: offre.contact?.coordonnees1 || offre.entreprise?.url || "",
  };
}

async function runCron() {
  try {
    const token = await getToken();
    let allOffres = [];
    const communeBatches = splitCommunes(COMMUNES_MONTPELLIER);

    for (const communesBatch of communeBatches) {
      let start = 0;

      while (true) {
        const batch = await fetchOffres(token, communesBatch, start);
        if (batch.length === 0) {
          console.log(`⚠️ Aucun résultat pour communes [${communesBatch.join(",")}] start=${start}`);
          break;
        }

        allOffres.push(...batch.map(mapOffre));
        console.log(`📦 Total récupéré jusqu'à présent: ${allOffres.length} offres`);
        await new Promise((r) => setTimeout(r, TIMEOUT_MS));
        start += RANGE_SIZE;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffres, null, 2), "utf-8");
    console.log(`✅ Fichier JSON final généré: ${OUTPUT_FILE} (${allOffres.length} offres)`);
  } catch (err) {
    console.error("❌ Cron échoué:", err.message);
  }
}

runCron();
