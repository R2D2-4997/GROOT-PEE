import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { statusConnexion, qrCodeActuel } from './whatsapp';
import { analyserPieceJointe } from './ai-classifier';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

export function demarrerServeur() {
  
  const dossierStockage = path.join(__dirname, '..', 'stockage');
  if (!fs.existsSync(dossierStockage)) {
    fs.mkdirSync(dossierStockage);
  }
  app.use('/stockage', express.static(dossierStockage));

  app.get('/api/status', (req, res) => {
    res.json({ status: statusConnexion, qr: qrCodeActuel });
  });

  app.get('/api/documents', async (req, res) => {
    try {
      const documents = await prisma.document.findMany({
        orderBy: { dateReception: 'desc' }
      });
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  });

  app.post('/api/upload', async (req, res) => {
    const { base64Data, mimeType, nomOriginal } = req.body;
    
    try {
      console.log(`\n📥 Import web reçu : ${nomOriginal}`);
      const resultatTri = await analyserPieceJointe(`Fichier importé : ${nomOriginal}`, base64Data, mimeType);
      
      const extension = mimeType.split('/')[1] || 'png';
      const nomFichierComplet = `${resultatTri.nom_fichier_suggere}.${extension}`;
      const cheminAbsolu = path.join(dossierStockage, nomFichierComplet);
      
      fs.writeFileSync(cheminAbsolu, base64Data, 'base64');

      const nouveauDoc = await prisma.document.create({
        data: {
          nomFichier: nomFichierComplet,
          cheminStockage: `/stockage/${nomFichierComplet}`,
          categorie: resultatTri.categorie,
          labelProjet: resultatTri.label_projet,
          expediteur: "Upload Web",
          resume: resultatTri.resume_court,
          typeDocument: resultatTri.type_document,
          motsCles: resultatTri.mots_cles
        }
      });
      
      console.log("✅ Fichier web physiquement sauvegardé et enregistré !");
      res.json(nouveauDoc);
    } catch (error) {
      console.error("❌ Erreur Upload:", error);
      res.status(500).json({ error: "Erreur IA" });
    }
  });

  // 🌟 NOUVEAU : Logique de chemin personnalisé
  app.post('/api/export-local', async (req, res) => {
    const { nomProjet, customPath } = req.body;
    
    try {
      let baseDir;
      const nomDossierProjet = `Projet_${nomProjet.replace(/\s+/g, '_')}`;

      // Si l'utilisateur a fourni un chemin, on l'utilise. Sinon, on va sur le Bureau.
      if (customPath && customPath.trim() !== '') {
        baseDir = path.join(customPath.trim(), nomDossierProjet);
      } else {
        baseDir = path.join(os.homedir(), 'Desktop', 'Beeper_Archives', nomDossierProjet);
      }
      
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const docsDuProjet = await prisma.document.findMany({
        where: { labelProjet: nomProjet }
      });

      for (const doc of docsDuProjet) {
        const categorieDir = path.join(baseDir, doc.categorie || 'Autres');
        
        if (!fs.existsSync(categorieDir)) {
          fs.mkdirSync(categorieDir, { recursive: true });
        }

        const sourcePath = path.join(__dirname, '..', 'stockage', doc.nomFichier);
        const destPath = path.join(categorieDir, doc.nomFichier);
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
        }
      }

      console.log(`✅ Projet ${nomProjet} exporté vers : ${baseDir}`);
      res.json({ success: true, chemin: baseDir });
      
    } catch (error) {
      console.error("Erreur d'export local:", error);
      res.status(500).json({ error: "Erreur lors de la création des dossiers. Vérifiez que le chemin est valide." });
    }
  });

  app.listen(3001, () => {
    console.log('🌐 API Web démarrée sur http://localhost:3001');
  });
}