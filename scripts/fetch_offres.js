// scripts/fetch_offres.js
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
const DISTANCE = process.env.FT_DISTANCE || "20";

// Crée le dossier ./data si nécessaire
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function isoWithoutMilliseconds(date) {
  return date.toISOString().split('.')[0] + 'Z';
}

// ⚡ Dates : dernière 24h
const MIN_DATE = isoWithoutMilliseconds(new Date(Date.now() - 24 * 60 * 60 * 1000));
const MAX_DATE = isoWithoutMilliseconds(new Date());

const COMMUNES_MONTPELLIER = [
  "34172", "34070", "34110", "34120", "34090", "34130", "34000", "34270", "34370"
];

// Récupération du token Bearer via OAuth
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

  const data = await res.json();
  if (!data.access_token) throw new Error("Token OAuth invalide");
  console.log("🔑 Token récupéré avec succès");
  return data.access_token;
}

// Diviser les communes en batches de 5
function splitCommunes(communes) {
  const chunks = [];
  for (let i = 0; i < communes.length; i += 5) chunks.push(communes.slice(i, i + 5));
  return chunks;
}

// Fonction pour récupérer toutes les offres d’un batch de communes
async function fetchAllForBatch(token, communesBatch) {
  let start = 0;
  let batchOffres = [];

  while (true) {
    const params = new URLSearchParams({
      range: `${start}-${start + RANGE_SIZE - 1}`,
      minCreationDate: MIN_DATE,
      maxCreationDate: MAX_DATE,
      commune: communesBatch.join(","),
      distance: DISTANCE
    });

    const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params.toString()}`;

    console.log("---------------------------------------------------------");
    console.log(`📍 Fetching communes: [${communesBatch.join(",")}] start=${start}`);
    console.log(`📅 minCreationDate=${MIN_DATE}`);
    console.log(`📅 maxCreationDate=${MAX_DATE}`);
    console.log(`🌐 distance=${DISTANCE}`);
    console.log(`📜 Equivalent curl: curl -X GET "${url}" -H "Authorization: Bearer ${token}" -H "Accept: application/json"\n`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await res.text();
    if (!text || text.trim() === "") break;

    const json = JSON.parse(text);
    const resultats = json.resultats || [];
    if (resultats.length === 0) break;

    batchOffres.push(...resultats);
    console.log(`✅ ${resultats.length} offres récupérées dans ce chunk, total batch=${batchOffres.length}`);

    start += RANGE_SIZE;
    await new Promise((r) => setTimeout(r, TIMEOUT_MS));
  }

  return batchOffres;
}

// Mapping des offres pour JSON final
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

// 🚀 Main
async function run() {
  try {
    const token = await getToken();
    let allOffres = [];
    const batches = splitCommunes(COMMUNES_MONTPELLIER);

    for (const batch of batches) {
      const batchOffres = await fetchAllForBatch(token, batch);
      allOffres.push(...batchOffres.map(mapOffre));
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffres, null, 2), "utf-8");
    console.log(`✅ Fichier JSON final généré: ${OUTPUT_FILE} (${allOffres.length} offres)`);
  } catch (err) {
    console.error("❌ Cron échoué:", err.message);
    process.exit(1);
  }
}

run();
