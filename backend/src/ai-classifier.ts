import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ClassificationResult {
  categorie: string;
  label_projet: string;
  priorite: string;
  resume_court: string;
  nom_fichier_suggere: string;
  type_document: string; // 🌟 NOUVEAU
  mots_cles: string;     // 🌟 NOUVEAU
}

export async function analyserPieceJointe(texteMessage: string, base64Data: string, mimeType: string): Promise<ClassificationResult> {
  console.log("🧠 Analyse par l'IA Gemini en cours...");
  
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Tu es un agent de tri de documents très précis. Analyse le message et l'image.
             Réponds UNIQUEMENT avec un objet JSON valide, sans balise markdown.
             Format attendu :
             {
               "categorie": "Comptabilité" | "Juridique" | "Design" | "Autre",
               "label_projet": "Nom du projet ou 'Général'",
               "priorite": "Haute" | "Moyenne" | "Basse",
               "resume_court": "Description succincte de 10 mots max",
               "nom_fichier_suggere": "Nom_Standardise_Sans_Espace",
               "type_document": "Le type exact (ex: Ticket de caisse, Facture, Illustration, Mème, Contrat, Photo)",
               "mots_cles": "Génère 5 à 10 mots-clés séparés par des virgules (ex: marques visibles, objets, noms, dates, montants, couleurs dominantes)"
             }
             Contexte du message : "${texteMessage || 'Aucun texte'}"`;

  const imageParts = [{ inlineData: { data: base64Data, mimeType: mimeType } }];

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("Erreur de l'IA:", error);
    throw error;
  }
}