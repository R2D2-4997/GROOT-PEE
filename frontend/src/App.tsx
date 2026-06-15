import { useEffect, useState } from 'react';

interface Document {
  id: string;
  nomFichier: string;
  cheminStockage: string;
  categorie: string;
  labelProjet: string;
  resume: string;
  expediteur: string;
  typeDocument?: string;
  motsCles?: string;
}

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'architecture' | 'liste'>('chat');
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [sortOption, setSortOption] = useState<'nom' | 'categorie' | 'projet'>('nom');
  
  const [waStatus, setWaStatus] = useState<string>('INITIALISATION');
  const [waQR, setWaQR] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  
  const [exportingProject, setExportingProject] = useState<string | null>(null);
  
  // 🌟 NOUVEAU : États pour gérer le menu des options d'export
  const [exportModalProject, setExportModalProject] = useState<string | null>(null);
  const [customExportPath, setCustomExportPath] = useState<string>('');

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', text: 'Bonjour. Je suis l\'IA de Beeper. Tapez n\'importe quel mot-clé (ex: un montant, une marque, un objet) pour retrouver vos documents.' }
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/status');
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status);
          setWaQR(data.qr);
        }
      } catch (e) {
        console.error("Backend injoignable");
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (waStatus !== 'CONNECTE') return;
    const fetchDocs = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/documents');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setDocuments(data);
        }
      } catch (e) {}
    };
    fetchDocs();
    const interval = setInterval(fetchDocs, 3000);
    return () => clearInterval(interval);
  }, [waStatus]);

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64Full = reader.result as string;
      const [entete, base64Data] = base64Full.split(',');
      const mimeType = entete.match(/:(.*?);/)?.[1] || file.type;

      try {
        await fetch('http://localhost:3001/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, mimeType, nomOriginal: file.name })
        });
      } catch (err) {} finally {
        setIsUploading(false);
        e.target.value = '';
      }
    };
  };

  // 🌟 LE NOUVEAU MOTEUR DE RECHERCHE INTELLIGENT (Compréhension de phrases)
  const handleSendMessage = (e: any) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');

    setTimeout(() => {
      // 1. Dictionnaire des mots à ignorer pour comprendre le sens de la phrase
      const motsInutiles = ['je', 'cherche', 'trouve', 'moi', 'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'au', 'aux', 'et', 'est', 'ce', 'que', 'qui', 'dans', 'pour', 'avec', 'document', 'fichier', 'affiche', 'montre', 'veux', 'voudrais', 'peux', 'tu', 'avoir', 'voir', 'sur'];
      
      // 2. Nettoyage de la phrase : on enlève la ponctuation, on découpe, et on garde les mots utiles
      const motsRecherche = userMsg.toLowerCase()
        .replace(/[.,!?']/g, ' ') // Remplace la ponctuation par des espaces
        .split(/\s+/)             // Découpe chaque mot
        .filter(mot => mot.length > 2 && !motsInutiles.includes(mot)); // Retire les mots courts et inutiles

      // Sécurité : si l'utilisateur ne tape que "je veux voir", on garde sa phrase de base
      const motsClefsFinaux = motsRecherche.length > 0 ? motsRecherche : userMsg.toLowerCase().split(/\s+/);

      // 3. Calcul du "Score de pertinence" pour chaque document
      const resultatsAvecScore = (documents || []).map(d => {
        if (!d) return { doc: d, score: 0 };
        
        // On fusionne tout le texte du document pour le scanner
        const texteComplet = `${d.nomFichier} ${d.resume} ${d.categorie} ${d.labelProjet} ${d.motsCles || ''} ${d.typeDocument || ''}`.toLowerCase();
        
        let score = 0;
        // On donne +1 point pour chaque mot-clé trouvé dans le document
        motsClefsFinaux.forEach(mot => {
          if (texteComplet.includes(mot)) {
            score += 1;
          }
        });
        
        return { doc: d, score };
      }).filter(item => item.score > 0); // On ne garde que les documents qui ont au moins 1 point

      // 4. Tri pour mettre le document avec le plus haut score en premier
      resultatsAvecScore.sort((a, b) => b.score - a.score);
      
      const resultats = resultatsAvecScore.map(item => item.doc);

      // 5. Réponse du Bot
      let botReply = "Je n'ai trouvé aucun document correspondant à votre demande.";
      
      if (resultats.length > 0) {
        botReply = `Voici ce que j'ai trouvé de plus pertinent (${resultats.length} résultat${resultats.length > 1 ? 's' : ''}) :\n\n` + 
          resultats.map(r => `📄 **${r.nomFichier || 'Fichier inconnu'}**\n📂 Projet: ${r.labelProjet || '-'} | 📑 Type: ${r.typeDocument || 'Générique'}\n📝 ${r.resume || ''}`).join('\n\n');
      } else if (motsRecherche.length === 0) {
         botReply = "Pourriez-vous être un peu plus précis sur le fichier que vous recherchez ? (ex: 'Trouve moi la facture d'électricité')";
      }

      setMessages(prev => [...prev, { role: 'bot', text: botReply }]);
    }, 500);
  };

  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`http://localhost:3001${doc.cheminStockage}`);
      if (!response.ok) throw new Error("Fichier introuvable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nomFichier;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("⚠️ Impossible de télécharger. Fichier physique absent.");
    }
  };

  // 🌟 LA FONCTION GÈRE MAINTENANT LES DEUX CAS (DÉFAUT OU PERSONNALISÉ)
  const handleDownloadProject = async (nomProjet: string, customPath: string | null) => {
    setExportingProject(nomProjet);
    
    try {
      const response = await fetch('http://localhost:3001/api/export-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomProjet, customPath })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ PROJET EXPORTÉ AVEC SUCCÈS !\n\nL'arborescence a été créée ici :\n${data.chemin}`);
        setExportModalProject(null); // Ferme le menu après succès
        setCustomExportPath('');     // Réinitialise le champ
      } else {
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (error) {
      alert("⚠️ Impossible de contacter le moteur de l'application.");
    } finally {
      setExportingProject(null);
    }
  };

  const toggleProject = (projet: string) => setExpandedProjects(prev => ({ ...prev, [projet]: !prev[projet] }));
  const toggleCategory = (cle: string) => setExpandedCategories(prev => ({ ...prev, [cle]: !prev[cle] }));

  const documentsTries = [...(documents || [])].sort((a, b) => {
    if (sortOption === 'nom') return (a?.nomFichier || '').localeCompare(b?.nomFichier || '');
    if (sortOption === 'categorie') return (a?.categorie || '').localeCompare(b?.categorie || '');
    if (sortOption === 'projet') return (a?.labelProjet || '').localeCompare(b?.labelProjet || '');
    return 0;
  });

  const architecture = (documents || []).reduce((acc, doc) => {
    if (!doc) return acc;
    const projet = doc?.labelProjet || 'Sans Projet';
    const categorie = doc?.categorie || 'Sans Catégorie';
    if (!acc[projet]) acc[projet] = {};
    if (!acc[projet][categorie]) acc[projet][categorie] = [];
    acc[projet][categorie].push(doc);
    return acc;
  }, {} as Record<string, Record<string, Document[]>>);

  if (waStatus !== 'CONNECTE') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'system-ui' }}>
        <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ width: '50px', height: '50px', backgroundColor: '#10a37f', borderRadius: '12px', margin: '0 auto 20px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📱</div>
          <h1 style={{ margin: '0 0 10px 0', color: '#1f2937', fontSize: '1.5rem' }}>Beeper Sorter</h1>
          {waStatus === 'ATTENTE_QR' && waQR ? (
            <>
              <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '0.95rem' }}>Scannez ce code pour démarrer le système.</p>
              <div style={{ background: 'white', padding: '16px', display: 'inline-block', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(waQR)}`} alt="QR Code" style={{ width: '220px', height: '220px' }} />
              </div>
            </>
          ) : (
            <div style={{ padding: '40px 0' }}><p style={{ color: '#6b7280' }}>Démarrage...</p></div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Inter", system-ui, sans-serif', backgroundColor: '#ffffff', color: '#0f0f0f' }}>
      
      <div style={{ width: isMenuOpen ? '260px' : '0px', backgroundColor: '#f9f9f9', borderRight: isMenuOpen ? '1px solid #e5e5e5' : 'none', transition: 'width 0.3s ease', overflow: 'hidden', display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
        <div style={{ padding: '20px', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '24px', height: '24px', backgroundColor: '#10a37f', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>IA</div>
          Beeper IA
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px', gap: '5px' }}>
          <button onClick={() => setActiveView('chat')} style={btnMenu(activeView === 'chat')}>💬 Assistant IA</button>
          <button onClick={() => setActiveView('architecture')} style={btnMenu(activeView === 'architecture')}>🗂️ Arborescence</button>
          <button onClick={() => setActiveView('liste')} style={btnMenu(activeView === 'liste')}>📋 Tous les fichiers</button>
        </nav>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        <div style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e5e5', backgroundColor: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#666' }}>☰</button>
            <span style={{ marginLeft: '15px', fontWeight: '600', fontSize: '1.1rem' }}>
              {activeView === 'chat' && 'Assistant Documentaire'}
              {activeView === 'architecture' && 'Explorateur de Projets'}
              {activeView === 'liste' && 'Base de données globale'}
            </span>
          </div>
          <div>
            <input type="file" id="fileUpload" style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
            <label htmlFor="fileUpload" style={{ backgroundColor: isUploading ? '#9ca3af' : '#10a37f', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: isUploading ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: '500', display: 'inline-block', transition: '0.2s' }}>
              {isUploading ? '⏳ Analyse en cours...' : '📤 Importer un fichier'}
            </label>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#fdfdfd' }}>
          
          {activeView === 'chat' && (
             <div style={{ width: '100%', maxWidth: '768px', flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
             <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '20px' }}>
               {messages.map((msg, idx) => (
                 <div key={idx} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                   <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: msg.role === 'user' ? '#333' : '#10a37f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.8rem', flexShrink: 0 }}>{msg.role === 'user' ? 'Vous' : 'IA'}</div>
                   <div style={{ backgroundColor: msg.role === 'user' ? '#f3f4f6' : 'transparent', padding: msg.role === 'user' ? '12px 16px' : '6px 0', borderRadius: '12px', maxWidth: '85%', lineHeight: '1.6', fontSize: '1rem', color: '#2d2d2d', whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                 </div>
               ))}
             </div>
             <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
               <form onSubmit={handleSendMessage} style={{ position: 'relative', display: 'flex', alignItems: 'center', boxShadow: '0 0 15px rgba(0,0,0,0.1)', borderRadius: '16px', backgroundColor: 'white', border: '1px solid #e5e5e5' }}>
                 <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cherchez une marque, un prix, un type..." style={{ flex: 1, padding: '16px 20px', border: 'none', borderRadius: '16px', fontSize: '1rem', outline: 'none' }} />
                 <button type="submit" style={{ position: 'absolute', right: '10px', backgroundColor: input.trim() ? '#10a37f' : '#e5e5e5', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: input.trim() ? 'pointer' : 'default' }}>➤</button>
               </form>
             </div>
           </div>
          )}

          {activeView === 'architecture' && (
             <div style={{ width: '100%', maxWidth: '800px', padding: '30px' }}>
              {Object.keys(architecture).length === 0 && <p style={{ color: '#666', textAlign: 'center' }}>Aucun fichier pour le moment.</p>}
              
              {Object.keys(architecture).map(projet => (
                <div key={projet} style={{ marginBottom: '15px', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: 'white', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  
                  <div style={{ padding: '16px 20px', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div onClick={() => toggleProject(projet)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                      <span style={{ marginRight: '10px', fontSize: '1.2rem', transition: 'transform 0.2s', display: 'inline-block', transform: expandedProjects[projet] ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span style={{ fontSize: '1.2rem', marginRight: '10px' }}>{expandedProjects[projet] ? '📂' : '📁'}</span>
                      <span style={{ fontWeight: '600', fontSize: '1.1rem', color: '#1f2937' }}>{projet}</span>
                    </div>
                    
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        // Ouvre ou ferme le menu d'export
                        setExportModalProject(exportModalProject === projet ? null : projet); 
                      }}
                      style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s' }}
                    >
                      📦 Exporter...
                    </button>
                  </div>

                  {/* 🌟 LE NOUVEAU MENU DÉROULANT DES OPTIONS D'EXPORTATION */}
                  {exportModalProject === projet && (
                    <div style={{ padding: '15px 20px', backgroundColor: '#eff6ff', borderTop: '1px solid #bfdbfe', borderBottom: '1px solid #e5e5e5' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#1e40af', fontSize: '0.95rem' }}>Où souhaitez-vous exporter ce projet ?</h4>
                      
                      <div style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
                        {/* Option 1: Bureau */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button 
                            onClick={() => handleDownloadProject(projet, null)}
                            disabled={exportingProject === projet}
                            style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: exportingProject === projet ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 'bold', width: '220px', textAlign: 'center' }}
                          >
                            {exportingProject === projet ? '⏳ En cours...' : '🏠 Sur le Bureau (Défaut)'}
                          </button>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Crée un dossier sur votre Bureau Windows.</span>
                        </div>

                        {/* Option 2: Personnalisé */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input 
                            type="text" 
                            placeholder="Ex: D:\Mes_Archives\Projets" 
                            value={customExportPath}
                            onChange={(e) => setCustomExportPath(e.target.value)}
                            style={{ width: '220px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }}
                          />
                          <button 
                            onClick={() => handleDownloadProject(projet, customExportPath)}
                            disabled={!customExportPath.trim() || exportingProject === projet}
                            style={{ backgroundColor: !customExportPath.trim() ? '#94a3b8' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: !customExportPath.trim() ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                          >
                            📂 Exporter ici
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {expandedProjects[projet] && (
                    <div style={{ padding: '10px 20px 10px 40px', borderTop: '1px solid #e5e5e5' }}>
                      {Object.keys(architecture[projet]).map(categorie => {
                        const cleCategorie = `${projet}-${categorie}`;
                        return (
                          <div key={categorie} style={{ marginBottom: '10px' }}>
                            <div onClick={() => toggleCategory(cleCategorie)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px 0', userSelect: 'none' }}>
                              <span style={{ marginRight: '8px', fontSize: '0.9rem', color: '#9ca3af', transition: 'transform 0.2s', display: 'inline-block', transform: expandedCategories[cleCategorie] ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                              <span style={{ fontSize: '1.1rem', marginRight: '8px' }}>{expandedCategories[cleCategorie] ? '📂' : '📁'}</span>
                              <span style={{ fontWeight: '500', color: '#4b5563' }}>{categorie}</span>
                            </div>

                            {expandedCategories[cleCategorie] && (
                              <div style={{ paddingLeft: '35px', marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {architecture[projet][categorie].map((doc, i) => (
                                  <div key={doc?.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: '10px 15px', borderRadius: '6px', border: '1px solid #f3f4f6' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                      <span style={{ fontSize: '1.5rem', marginTop: '2px' }}>📄</span>
                                      <div>
                                        <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#111827' }}>{doc?.nomFichier || 'Fichier Inconnu'}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>{doc?.typeDocument || 'Générique'} - {doc?.resume}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                          {doc?.motsCles && doc.motsCles.split(',').map((tag, tIdx) => (
                                            <span key={tIdx} style={{ backgroundColor: '#e5e7eb', color: '#374151', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '500' }}>#{tag.trim()}</span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                    <button onClick={() => handleDownload(doc)} style={{ backgroundColor: '#10a37f', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s', alignSelf: 'flex-start' }}>⬇️ Télécharger</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeView === 'liste' && (
            <div style={{ width: '100%', maxWidth: '1000px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#666' }}>Trier par :</span>
                  <select value={sortOption} onChange={(e) => setSortOption(e.target.value as any)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', outline: 'none' }}>
                    <option value="nom">Nom du fichier (A-Z)</option>
                    <option value="categorie">Catégorie</option>
                    <option value="projet">Label de Projet</option>
                  </select>
                </div>
              </div>
              <div style={{ border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
                    <tr>
                      <th style={{ padding: '15px', fontWeight: '600', color: '#666' }}>Nom & Type</th>
                      <th style={{ padding: '15px', fontWeight: '600', color: '#666' }}>Catégorie & Projet</th>
                      <th style={{ padding: '15px', fontWeight: '600', color: '#666', width: '40%' }}>Mots-clés (Tags)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentsTries.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center' }}>Aucun fichier</td></tr>
                    ) : (
                      documentsTries.map((doc, i) => (
                        <tr key={doc?.id || i} style={{ borderBottom: i === documentsTries.length - 1 ? 'none' : '1px solid #f0f0f0', backgroundColor: 'white' }}>
                          <td style={{ padding: '15px' }}>
                            <div style={{ fontWeight: '600', color: '#111827' }}>📄 {doc?.nomFichier || 'Inconnu'}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>Type : {doc?.typeDocument || '-'}</div>
                          </td>
                          <td style={{ padding: '15px' }}>
                            <div style={{ marginBottom: '6px' }}><span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{doc?.categorie || 'Inconnu'}</span></div>
                            <div><span style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{doc?.labelProjet || 'Inconnu'}</span></div>
                          </td>
                          <td style={{ padding: '15px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {doc?.motsCles ? doc.motsCles.split(',').map((tag, tIdx) => (
                                <span key={tIdx} style={{ backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', color: '#4b5563', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px' }}>#{tag.trim()}</span>
                              )) : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Aucun tag</span>}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const btnMenu = (isActive: boolean) => ({
  width: '100%', textAlign: 'left' as const, padding: '12px 15px', backgroundColor: isActive ? '#e5e5e5' : 'transparent',
  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', color: isActive ? '#171717' : '#4b5563',
  fontWeight: isActive ? '600' : '400', transition: 'background 0.2s'
});

export default App;