import * as dotenv from 'dotenv';
dotenv.config();

async function listerModeles() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ Clé API introuvable dans le fichier .env");
    return;
  }
  
  console.log("🔍 Interrogation des serveurs de Google...");
  
  try {
    const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await reponse.json();
    
    console.log("\n✅ Voici les modèles exacts autorisés pour votre clé :");
    data.models.forEach((modele: any) => {
        // On filtre pour ne garder que les modèles capables d'analyser du contenu
        if (modele.supportedGenerationMethods && modele.supportedGenerationMethods.includes("generateContent")) {
            console.log(`👉 ${modele.name.replace('models/', '')}`);
        }
    });
  } catch (erreur) {
    console.error("Erreur de connexion :", erreur);
  }
}

listerModeles();