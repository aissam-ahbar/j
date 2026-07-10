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

const OUTPUT_FILE_OFFRES = "./data/lba-offres.json";
const OUTPUT_FILE_RECRUTEURS = "./data/lba-recruteurs.json"; // 🆕 marché caché
const OUTPUT_DIR = path.dirname(OUTPUT_FILE_OFFRES);

const RADIUS = "30";
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

async function run() {
  try {
    const data = await fetchOffres();

    // ---- Offres classiques : donnees brutes, aucun mapping ici ----
    // Le mapping (intitule, entreprise, lieu, etc.) se fait cote Angular
    const offres = data.jobs || [];

    fs.writeFileSync(
      OUTPUT_FILE_OFFRES,
      JSON.stringify(offres, null, 2),
      "utf8"
    );

    console.log(
      `✅ ${offres.length} offres enregistrées (brutes) dans ${OUTPUT_FILE_OFFRES}`
    );

    // ---- 🆕 Marché caché / candidature spontanée : donnees brutes ----
    const recruteurs = data.recruiters || [];

    fs.writeFileSync(
      OUTPUT_FILE_RECRUTEURS,
      JSON.stringify(recruteurs, null, 2),
      "utf8"
    );

    console.log(
      `✅ ${recruteurs.length} entreprises (marché caché) enregistrées (brutes) dans ${OUTPUT_FILE_RECRUTEURS}`
    );

    if (data.warnings) {
      console.warn("⚠️ Avertissement API :", data.warnings);
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  }
}

run();
