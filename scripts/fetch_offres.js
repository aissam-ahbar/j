import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.FT_CLIENT_ID;
const CLIENT_SECRET = process.env.FT_CLIENT_SECRET;

const OUTPUT_FILE = "./offres.json";

const TIMEOUT_MS = 300; // sécurité API
const RANGE_SIZE = 149;

// communes Montpellier Métropole
const COMMUNES_MONTPELLIER = [
  "34172", // Montpellier
  "34070",
  "34110",
  "34120",
  "34090",
  "34130",
  "34000",
  "34270",
  "34370"
];


// découper tableau en groupes de 5
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const COMMUNES_GROUPS = chunkArray(COMMUNES_MONTPELLIER, 5);


// date -24h format ISO sans millisecondes
function getDate24hAgoISO() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}


// récupération token OAuth
async function getToken() {

  const res = await fetch(
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "o2dsoffre api_offresdemploiv2"
      })
    }
  );

  const text = await res.text();
  console.log("Token response:", text);

  const data = JSON.parse(text);
  return data.access_token;
}


// appel API offres
async function fetchOffres(token, communes, start = 0) {

  const params = new URLSearchParams({
    range: `${start}-${start + RANGE_SIZE}`,
    minCreationDate: getDate24hAgoISO(),
    commune: communes.join(","),
    accesTravailleurHandicape: "true"
  });

  const url =
    "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?" +
    params.toString();

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  console.log("API response before:", params);
  
  const text = await res.text();
  console.log("API response after:", text);

  try {
    const json = JSON.parse(text);
    return json.resultats || [];
  } catch (err) {
    console.error("❌ Réponse API non JSON:", text);
    throw err;
  }
}


// mapping pour ton moteur IA
function mapOffre(offre) {
  return {
    id: offre.id,
    intitule: offre.intitule,
    description: offre.description,

    dateActualisation: offre.dateActualisation,

    lieuTravail: {
      commune: offre.lieuTravail?.commune,
      latitude: offre.lieuTravail?.latitude,
      longitude: offre.lieuTravail?.longitude
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

    urlPostulation:
      offre.contact?.coordonnees1 ||
      offre.entreprise?.url ||
      null
  };
}


// cron principal
async function runCron() {

  try {

    console.log("🚀 Start cron France Travail");

    const token = await getToken();

    let allOffres = [];

    for (const communes of COMMUNES_GROUPS) {

      console.log("📍 communes:", communes);

      let start = 0;

      while (true) {

        const batch = await fetchOffres(token, communes, start);

        if (batch.length === 0) break;

        const mapped = batch.map(mapOffre);

        allOffres.push(...mapped);

        console.log(
          `📦 ${mapped.length} offres récupérées (range ${start})`
        );

        start += RANGE_SIZE;

        await new Promise((r) => setTimeout(r, TIMEOUT_MS));
      }
    }

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(allOffres, null, 2),
      "utf-8"
    );

    console.log(`✅ ${allOffres.length} offres sauvegardées`);

  } catch (err) {

    console.error("❌ Cron échoué:", err);

  }
}


runCron();
