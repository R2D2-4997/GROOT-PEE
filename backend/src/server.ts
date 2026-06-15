import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { statusConnexion, qrCodeActuel } from './whatsapp';
import { analyserPieceJointe, interpreterRecherche } from './ai-classifier';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process'; // 🌟 NOUVEAU

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
          domaineDetecte: resultatTri.domaine_detecte, // 🌟 AJOUT
          categorie: resultatTri.categorie,
          labelProjet: resultatTri.label_projet,
          expediteur: "Vous",                          // 🌟 AJOUT
          plateforme: "Interface Web",                 // 🌟 AJOUT
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

      // 3. Crée les dossiers et copie les fichiers avec une arborescence experte
      for (const doc of docsDuProjet) {
        const domaineDir = doc.domaineDetecte ? doc.domaineDetecte.replace(/[\/\\]/g, '-').replace(/\s+/g, '_') : 'Autres_Domaines';
        const categorieDir = doc.categorie ? doc.categorie.replace(/[\/\\]/g, '-').replace(/\s+/g, '_') : 'Autres';
        
        // 🌟 NOUVELLE ARCHITECTURE : Base > Domaine > Projet > Catégorie
        const finalDir = path.join(baseDir, domaineDir, nomDossierProjet, categorieDir);
        
        if (!fs.existsSync(finalDir)) {
          fs.mkdirSync(finalDir, { recursive: true });
        }

        const sourcePath = path.join(__dirname, '..', 'stockage', doc.nomFichier);
        const destPath = path.join(finalDir, doc.nomFichier);
        
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
// 🌟 NOUVEAU : Route de recherche sémantique par IA
  app.post('/api/search', async (req, res) => {
    const { requete } = req.body;
    try {
      // 1. L'IA déchiffre la demande
      const criteres = await interpreterRecherche(requete);
      console.log("🔍 Intentions comprises par l'IA :", criteres);

      // 2. On récupère toute la base
      const documents = await prisma.document.findMany();

      // 3. On note chaque document selon sa pertinence
      const resultatsAvecScore = documents.map(doc => {
        let score = 0;
        const texteComplet = `${doc.nomFichier} ${doc.resume} ${doc.categorie} ${doc.labelProjet} ${doc.motsCles} ${doc.typeDocument}`.toLowerCase();

        // Points basiques pour les mots-clés
        if (criteres.mots_cles && Array.isArray(criteres.mots_cles)) {
           criteres.mots_cles.forEach(mot => {
             if (mot.length > 2 && texteComplet.includes(mot.toLowerCase())) score += 1;
           });
        }

        // Points MAJEURS si l'IA a détecté une cible spécifique
        if (criteres.projet_cible && doc.labelProjet?.toLowerCase().includes(criteres.projet_cible.toLowerCase())) score += 10;
        if (criteres.categorie_cible && doc.categorie?.toLowerCase().includes(criteres.categorie_cible.toLowerCase())) score += 10;
        if (criteres.type_document_cible && doc.typeDocument?.toLowerCase().includes(criteres.type_document_cible.toLowerCase())) score += 10;

        return { document: doc, score };
      }).filter(item => item.score > 0);

      // 4. On trie par note décroissante
      resultatsAvecScore.sort((a, b) => b.score - a.score);

      res.json({
        criteresIA: criteres,
        resultats: resultatsAvecScore.map(r => r.document)
      });
      
    } catch (error) {
      console.error("Erreur de recherche", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
  // 🌟 NOUVEAU : Supprimer un document (Base de données + Fichier physique)
  app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
      // 1. Trouver le document pour connaître le nom du fichier
      const doc = await prisma.document.findUnique({ where: { id } });
      
      if (doc) {
        // 2. Supprimer le fichier physique du dossier stockage
        const cheminPhysique = path.join(dossierStockage, doc.nomFichier);
        if (fs.existsSync(cheminPhysique)) {
          fs.unlinkSync(cheminPhysique);
        }
      }

      // 3. Supprimer l'entrée dans la base de données
      await prisma.document.delete({ where: { id } });
      
      console.log(`🗑️ Document ${id} supprimé avec succès.`);
      res.json({ success: true });
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      res.status(500).json({ error: "Impossible de supprimer le document" });
    }
  });

  // 🌟 NOUVEAU : Ré-analyser (re-labelliser) un document existant
  app.post('/api/documents/:id/reclassify', async (req, res) => {
    const { id } = req.params;
    try {
      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) return res.status(404).json({ error: "Document introuvable en base" });

      const cheminPhysique = path.join(dossierStockage, doc.nomFichier);
      if (!fs.existsSync(cheminPhysique)) {
        return res.status(404).json({ error: "Le fichier physique n'existe plus sur le disque" });
      }

      // 1. Re-lire le fichier physique en Base64
      const base64Data = fs.readFileSync(cheminPhysique, { encoding: 'base64' });
      
      // Déduire le bon MimeType selon l'extension pour l'IA
      const ext = doc.nomFichier.split('.').pop() || 'png';
      const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      console.log(`🔄 Re-classification par l'IA demandée pour : ${doc.nomFichier}`);
      
      // 2. Relancer l'analyse de l'IA (qui utilise le méta-prompt adaptatif)
      const resultatTri = await analyserPieceJointe("Mise à jour / Re-labellisation manuelle", base64Data, mimeType);

      // 3. Mettre à jour la ligne dans la base de données avec les nouvelles valeurs
      const docMisAJour = await prisma.document.update({
        where: { id },
        data: {
          domaineDetecte: resultatTri.domaine_detecte, // si présent dans votre schéma
          categorie: resultatTri.categorie,
          labelProjet: resultatTri.label_projet,
          resume: resultatTri.resume_court,
          typeDocument: resultatTri.type_document,
          motsCles: resultatTri.mots_cles
        }
      });

      res.json(docMisAJour);
    } catch (error) {
      console.error("Erreur de re-labellisation:", error);
      res.status(500).json({ error: "Échec de l'analyse corrective par l'IA" });
    }
  });
  // 🌟 NOUVEAU : Ouvrir l'emplacement du fichier sur l'ordinateur
  app.post('/api/documents/:id/open', async (req, res) => {
    const { id } = req.params;
    try {
      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) return res.status(404).json({ error: "Document introuvable" });

      const cheminPhysique = path.join(dossierStockage, doc.nomFichier);
      if (!fs.existsSync(cheminPhysique)) {
        return res.status(404).json({ error: "Le fichier n'existe plus sur le disque" });
      }

      // La commande Windows pour ouvrir le dossier et surligner le fichier
      exec(`explorer /select,"${cheminPhysique}"`);

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur d'ouverture:", error);
      res.status(500).json({ error: "Impossible d'ouvrir l'explorateur" });
    }
  });
  app.listen(3001, () => {
    console.log('🌐 API Web démarrée sur http://localhost:3001');
  });
}