// scripts/fetch_lba.js

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const TOKEN_LBA = process.env.TOKEN_LBA;

if (!TOKEN_LBA) {
  console.error("❌ TOKEN_LBA doit être défini dans le .env");
  process.exit(1);
}

const OUTPUT_FILE = "./data/lba-offres.json";
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

const RADIUS = "30";
const DEPARTEMENTS = process.env.LBA_DEPARTEMENTS || "34";

// dernières 24h
const LAST_24H = 24 * 60 * 60 * 1000;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function fetchOffres() {
  const params = new URLSearchParams({
    radius: RADIUS,
    departements: DEPARTEMENTS,
  });

  const url = `https://api.apprentissage.beta.gouv.fr/api/job/v1/search?${params.toString()}`;

  console.log("---------------------------------------------------------");
  console.log(`🌐 ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN_LBA}`,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Erreur ${res.status} : ${error}`);
  }

  return await res.json();
}

function isLast24Hours(offre) {
  const creation = offre.offer?.publication?.creation;

  if (!creation) return false;

  return Date.now() - new Date(creation).getTime() <= LAST_24H;
}

function mapOffre(offre) {
  const coordinates =
    offre.workplace?.location?.geopoint?.coordinates ?? [null, null];

  return {
    id: offre.identifier?.id,

    intitule: offre.offer?.title,
    description: offre.offer?.description,

    employeur: {
      nom:
        offre.workplace?.name ||
        offre.workplace?.legal_name ||
        null,
    },

    lieuTravail: {
      commune: offre.workplace?.location?.address,
      libelle: offre.workplace?.location?.address,
      latitude: coordinates[1],
      longitude: coordinates[0],
    },

    typeContrat: offre.contract?.type?.[0] || null,
    typeContratLibelle:
      offre.contract?.type?.join(", ") || null,

    natureContrat: null,

    alternance: true,

    salaire: {
      libelle: null,
    },

    experienceLibelle:
      offre.offer?.target_diploma?.label || "Débutant",

    dateCreation:
      offre.offer?.publication?.creation,

    dateActualisation:
      offre.offer?.publication?.creation,

    urlOrigine:
      offre.apply?.url || null,

    nombrePostes:
      offre.offer?.opening_count || 1,

    romeCode:
      offre.offer?.rome_codes?.[0] || null,

    competences:
      offre.offer?.desired_skills || [],

    entreprise: {
      taille: offre.workplace?.size,
      secteurCode:
        offre.workplace?.domain?.naf?.code,
      secteurLibelle:
        offre.workplace?.domain?.naf?.label,
    },

    source: "La Bonne Alternance"
  };
}

async function run() {
  try {
    const data = await fetchOffres();

    // L'API renvoie directement un tableau
    const offres = Array.isArray(data) ? data : [];

    console.log(`📦 ${offres.length} offres récupérées`);

    const recentes = offres.filter(isLast24Hours);

    console.log(
      `🕒 ${recentes.length} offres publiées durant les dernières 24h`
    );

    const mapped = recentes.map(mapOffre);

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(mapped, null, 2),
      "utf8"
    );

    console.log(
      `✅ ${mapped.length} offres enregistrées dans ${OUTPUT_FILE}`
    );
  } catch (err) {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  }
}

run();
