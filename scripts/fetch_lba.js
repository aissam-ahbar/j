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


// dernières 48 heures
const LAST_48H = 48 * 60 * 60 * 1000;


if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true
    }
  );
}



async function fetchOffres() {

  const params = new URLSearchParams({

    radius: RADIUS,

    departements: DEPARTEMENTS

  });


  const url =
    `https://api.apprentissage.beta.gouv.fr/api/job/v1/search?${params}`;


  console.log("-------------------------------------------");
  console.log("🌐", url);


  const response = await fetch(url, {

    method: "GET",

    headers: {

      Accept: "application/json",

      Authorization:
        `Bearer ${TOKEN_LBA}`

    }

  });


  if (!response.ok) {

    const error =
      await response.text();

    throw new Error(
      `${response.status} : ${error}`
    );

  }


  return await response.json();

}



function getCreationDate(offre) {

  return (

    offre.offer?.publication?.creation ||

    offre.offer?.publicationDate ||

    offre.creation ||

    offre.createdAt ||

    null

  );

}



function isRecent(offre) {


  const creation =
    getCreationDate(offre);


  // Si aucune date fournie,
  // on garde l'offre
  if (!creation) {

    return true;

  }


  const date =
    new Date(creation).getTime();


  if (isNaN(date)) {

    return true;

  }


  return (
    Date.now() - date <= LAST_48H
  );

}



function mapOffre(offre) {


  const coordinates =
    offre.workplace
      ?.location
      ?.geopoint
      ?.coordinates
    ?? [null, null];


  const contractTypes =
    offre.contract?.type ?? [];



  return {


    id:
      offre.identifier?.id ?? null,


    source:
      "LBA",


    intitule:
      offre.offer?.title ?? "—",


    description:
      offre.offer?.description ?? "",



    employeur: {

      nom:

        offre.workplace?.name ||

        offre.workplace?.legal_name ||

        "—"

    },



    lieuTravail: {


      commune:

        offre.workplace
          ?.location
          ?.address ?? "—",


      libelle:

        offre.workplace
          ?.location
          ?.address ?? "—",


      latitude:
        coordinates[1],


      longitude:
        coordinates[0]

    },



    typeContrat:

      contractTypes[0] ?? null,


    typeContratLibelle:

      contractTypes.join(", ") || null,



    natureContrat:

      null,



    alternance:

      true,



    salaire: {

      libelle:
        null

    },



    experienceLibelle:

      offre.offer
        ?.target_diploma
        ?.label
      ??
      "Débutant",



    dateCreation:

      getCreationDate(offre),



    dateActualisation:

      getCreationDate(offre),



    urlOrigine:

      offre.apply?.url ?? null,



    nombrePostes:

      offre.offer?.opening_count ?? 1,


    romeCode:

      offre.offer
        ?.rome_codes?.[0]
      ?? null,


    competences:

      offre.offer
        ?.desired_skills
      ?? []

  };

}





async function run() {


  try {


    const data =
      await fetchOffres();



    const offres =
      Array.isArray(data)
        ? data
        : [];



    console.log(
      `📦 ${offres.length} offres récupérées`
    );


    if (offres.length > 0) {

      console.log(
        "Exemple première offre :",
        offres[0]
      );

    }



    const recentes =
      offres.filter(isRecent);



    console.log(
      `🕒 ${recentes.length} offres conservées`
    );



    const mapped =
      recentes.map(mapOffre);



    fs.writeFileSync(

      OUTPUT_FILE,

      JSON.stringify(
        mapped,
        null,
        2
      ),

      "utf8"

    );



    console.log(
      `✅ ${mapped.length} offres écrites dans ${OUTPUT_FILE}`
    );



  }

  catch(error) {


    console.error(
      "❌ Erreur :",
      error.message
    );


    process.exit(1);

  }

}



run();
