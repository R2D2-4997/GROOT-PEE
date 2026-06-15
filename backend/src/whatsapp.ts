import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';

// 🌟 NOUVEAU : Variables pour partager l'état avec le site web
export let statusConnexion = 'INITIALISATION';
export let qrCodeActuel = '';

export function initialiserWhatsApp(onMediaReceived: (texte: string, base64: string, mime: string, expediteur: string) => void) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
  });

  client.on('qr', (qr) => {
    statusConnexion = 'ATTENTE_QR';
    qrCodeActuel = qr;
    console.log('\n📱 Le QR Code est prêt (visible sur le site web ou ci-dessous) :');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    statusConnexion = 'CONNECTE';
    qrCodeActuel = '';
    console.log('✅ Pont WhatsApp connecté !');
  });

  client.on('message_create', async (msg) => {
    if (msg.hasMedia) {
      const expediteur = (await msg.getContact()).pushname || msg.from;
      console.log(`📥 Fichier reçu de : ${expediteur}`);
      
      const media = await msg.downloadMedia();
      if (media && media.data) {
        onMediaReceived(msg.body, media.data, media.mimetype, expediteur);
      }
    }
  });

  client.initialize();
}