import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ClassificationResult {
  domaine_detecte: string;
  categorie: string;
  label_projet: string;
  priorite: string;
  resume_court: string;
  nom_fichier_suggere: string;
  type_document: string;
  mots_cles: string;
}

export async function analyserPieceJointe(texteMessage: string, base64Data: string, mimeType: string, tentative = 1): Promise<ClassificationResult> {
  console.log(`🧠 Analyse par l'IA Gemini en cours... (Tentative ${tentative}/3)`);
  
  // Utilisation du modèle Flash pour éviter de saturer le quota gratuit tout en gardant une excellente vitesse
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es une IA experte et polyvalente en classification de documents.
             Ta mission est d'abord d'identifier le domaine spécifique du document, puis d'utiliser le vocabulaire expert de ce domaine pour le classifier avec une précision chirurgicale.

             Analyse le message et l'image fournie, puis réponds UNIQUEMENT avec un objet JSON valide, sans balise markdown.
             
             Format attendu :
             {
               "domaine_detecte": "Le domaine principal (ex: Électronique & Robotique, Finance, Gaming, Mixologie, Développement Web, Voyage, etc.)",
               "categorie": "Catégorie générale (ex: Ingénierie, Administratif, Personnel, Scolarité, Loisirs)",
               "label_projet": "Nom précis du projet déduit (ex: Drawbot, Beeper, Minecraft, Recettes, ou 'Général')",
               "priorite": "Haute" | "Moyenne" | "Basse",
               "resume_court": "Description technique et précise de 10 mots max, utilisant le vocabulaire du domaine détecté",
               "nom_fichier_suggere": "Nom_Standardise_Avec_Tirets",
               "type_document": "Le type exact (ex: Test matériel, Facture, Schéma de câblage, Capture d'écran de jeu, Recette, Itinéraire de voyage)",
               "mots_cles": "5 à 10 mots-clés ultra-spécifiques au domaine (ex: si électronique -> ESP32, PID, breadboard ; si administratif -> TVA, SIRET ; si gaming -> Vanilla+, RPG, boss ; si mixologie -> amaretto, sirop violette type à l'eau, citron vert)"
             }
             Contexte du message : "${texteMessage || 'Aucun texte'}"`;

  const imageParts = [{ inlineData: { data: base64Data, mimeType: mimeType } }];

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error: any) {
    // Sécurité anti-crash au cas où Google est surchargé (Erreur 503)
    if (error.status === 503 && tentative < 3) {
      console.log("⚠️ Serveur Google surchargé. Le système attend 3 secondes avant de réessayer...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      return analyserPieceJointe(texteMessage, base64Data, mimeType, tentative + 1);
    }
    
    console.error("❌ Erreur définitive de l'IA:", error);
    throw error;
  }
}
// --- LE NOUVEAU MOTEUR D'INTERPRÉTATION DES RECHERCHES ---

export interface CriteresRecherche {
  mots_cles: string[];
  projet_cible: string | null;
  categorie_cible: string | null;
  type_document_cible: string | null;
}

export async function interpreterRecherche(requeteUtilisateur: string): Promise<CriteresRecherche> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es un documentaliste expert. Un utilisateur cherche un document dans sa base de données logicielle.
  Analyse sa phrase et extrais les critères de recherche précis.
  Réponds UNIQUEMENT avec un objet JSON valide, sans balise markdown.

  Format attendu :
  {
    "mots_cles": ["liste", "des", "mots", "importants", "à", "chercher"],
    "projet_cible": "Nom du projet si mentionné explicitement (ex: Drawbot, Voyage Chine), sinon null",
    "categorie_cible": "Catégorie si mentionnée (ex: Électronique, Design, Mixologie), sinon null",
    "type_document_cible": "Type de document si mentionné (ex: facture, schéma, test unitaire, recette), sinon null"
  }
  Requête utilisateur : "${requeteUtilisateur}"`;

  try {
    const result = await model.generateContent(prompt);
    let text = await result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("❌ Erreur d'interprétation de recherche:", error);
    // En cas d'erreur de quota, on renvoie une recherche basique
    return { mots_cles: requeteUtilisateur.split(' '), projet_cible: null, categorie_cible: null, type_document_cible: null };
  }
}