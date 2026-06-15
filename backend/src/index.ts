import { initialiserWhatsApp } from './whatsapp';
import { analyserPieceJointe } from './ai-classifier';
import { demarrerServeur } from './server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

console.log("🚀 Démarrage de Beeper File Sorter...");

demarrerServeur();

initialiserWhatsApp(async (texteMessage, base64Data, mimeType, expediteur) => {
  if (!mimeType.startsWith('image/')) {
    console.log(`❌ Format ignoré : ${mimeType} (Images uniquement pour le moment)`);
    return;
  }

  try {
    const resultatTri = await analyserPieceJointe(texteMessage, base64Data, mimeType);
    console.log("✅ Fichier trié :", resultatTri.nom_fichier_suggere);

    // 🌟 NOUVEAU : Sauvegarde PHYSIQUE du fichier
    const extension = mimeType.split('/')[1] || 'png';
    const nomFichierComplet = `${resultatTri.nom_fichier_suggere}.${extension}`;
    
    // Création du dossier "stockage" s'il n'existe pas
    const dossierStockage = path.join(__dirname, '..', 'stockage');
    if (!fs.existsSync(dossierStockage)) {
      fs.mkdirSync(dossierStockage);
    }
    
    // Écriture du fichier image sur le disque
    const cheminAbsolu = path.join(dossierStockage, nomFichierComplet);
    fs.writeFileSync(cheminAbsolu, base64Data, 'base64');

    // Sauvegarde dans la base de données
    await prisma.document.create({
      data: {
        nomFichier: nomFichierComplet,
        cheminStockage: `/stockage/${nomFichierComplet}`,
        categorie: resultatTri.categorie,
        labelProjet: resultatTri.label_projet,
        expediteur: expediteur,
        resume: resultatTri.resume_court,
        typeDocument: resultatTri.type_document, // 🌟 AJOUT
        motsCles: resultatTri.mots_cles
      }
    });
    console.log("💾 Enregistré physiquement sur le disque et dans la base de données !");
    
  } catch (error) {
    console.error("❌ Erreur lors du traitement :", error);
  }
});