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

const RADIUS = process.env.LBA_RADIUS || "30";
const DEPARTEMENTS = process.env.LBA_DEPARTEMENTS || "34";

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

function mapOffre(offre) {
  return {
    id: offre.id,
    intitule: offre.title,
    description: offre.description,

    entreprise: {
      nom: offre.company?.name,
    },

    lieuTravail: {
      ville: offre.place?.city,
      codePostal: offre.place?.zipcode,
      latitude: offre.place?.latitude,
      longitude: offre.place?.longitude,
    },

    contrat: {
      type: offre.contract_type,
      alternance: true,
    },

    salaire: offre.salary,

    url: offre.url,

    source: "La Bonne Alternance",

    // Garde l'objet complet au cas où
    raw: offre,
  };
}

async function run() {
  try {
    const data = await fetchOffres();

    // Selon le format de retour de l'API
    const offres =
      data.results ||
      data.jobs ||
      data.items ||
      data.data ||
      [];

    const mapped = offres.map(mapOffre);

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
