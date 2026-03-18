# 📋 Installation & Test - MediStock AI

Guide complet pour installer, lancer et tester le projet MediStock AI localement.

---

## 🔧 Prérequis

- **Node.js** >= 24.0 (télécharger depuis [nodejs.org](https://nodejs.org))
- **npm** >= 11.0 (inclus avec Node.js)
- **Git** (optionnel, pour cloner le repo)
- **Navigateur moderne** (Chrome, Firefox, Edge, Safari)
- **Moteur IA local**: Ollama ou llama.cpp (requis pour le chat local réel)

### Vérifier votre installation :
```powershell
node --version    # Doit afficher v24+
npm --version     # Doit afficher 11+
```

---

## 📦 Installation - Étape 1: Dépendances

### Backend :
```powershell
cd backend
npm install
```

### Configuration IA locale (Sprint 3) :

Créez `backend/.env` (ou utilisez les variables d environnement de votre shell) :

```env
CHAT_PROVIDER=ollama
CHAT_MODEL=llama3.2:3b
CHAT_TIMEOUT_MS=45000
CHAT_MAX_CONCURRENT=1
CHAT_MAX_TOKENS=600
CHAT_STATUS_CACHE_TTL_MS=5000
OLLAMA_BASE_URL=http://127.0.0.1:11434
LLAMA_CPP_BASE_URL=http://127.0.0.1:8080
CHAT_DISCLAIMER=Assistant local informatif uniquement. Ne remplace pas un avis medical professionnel.
```

Parametres Sprint 6 (stabilite locale):
- `CHAT_MAX_CONCURRENT`: limite de requetes IA simultanees pour eviter l epuisement memoire CPU.
- `CHAT_STATUS_CACHE_TTL_MS`: cache temporaire du statut modele pour reduire les appels repetes `/api/tags` ou `/v1/models`.

Exemple Ollama :
```powershell
ollama pull llama3.2:3b
ollama serve
```

Exemple llama.cpp (OpenAI-compatible server) :
```powershell
# Démarrer votre serveur llama.cpp avec endpoint /v1/* sur le port 8080
# puis définir:
$env:CHAT_PROVIDER="llama_cpp"
```

Changer de modele dans PowerShell (session courante) :
```powershell
$env:CHAT_MODEL="llama3.2:1b"
# ou
$env:CHAT_MODEL="llama2-uncensored:latest"
```

### Frontend :
```powershell
cd ../frontend
npm install
```

### Vérification :
```powershell
# Depuis le répertoire racine (PHARMACIE/)
ls backend/node_modules   # Doit exister
ls frontend/node_modules  # Doit exister
```

---

## 🤖 Démarrage d'Ollama

### Option 1 : Première utilisation (télécharger le modèle)

**Terminal Ollama :**
```powershell
# Télécharger le modèle llama3.2:3b (~2GB, quelques minutes)
ollama pull llama3.2:3b

# Démarrer le serveur Ollama
ollama serve
```

Vous verrez :
```
time=... level=INFO msg="Listening on 127.0.0.1:11434"
```

### Option 2 : Ollama déjà installé (sessions futures)

**Terminal Ollama :**
```powershell
ollama serve
```

⚠️ **Important :** Ollama doit rester actif dans un terminal pendant que vous utilisez le chat local.

---

## ▶️ Lancement du Projet

### Option A : Lancer les deux serveurs (Recommandé)

**Terminal 1 - Backend (port 4000) :**
```powershell
cd backend
npm run dev
```

Vous devez voir :
```
✓ Built in 1.2s
👂 Backend listening on port 4000
Database initialized with seed data
```

**Terminal 2 - Frontend (port 5173) :**
```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Vous devez voir :
```
VITE v7.3.1  ready in 1.6 ms

➜  Local:     http://127.0.0.1:5173/
```

### Option B : Accéder à l'application

Ouvrez votre navigateur : **http://127.0.0.1:5173**

Vous verrez :
- 📊 Dashboard (stats, alertes, mouvements)
- 📦 Inventaire (4 médicaments avec filtres)
- 👥 Profils (4 membres de la famille)
- 📜 Historique (4 mouvements)
- 💬 Assistant (chat local Ollama/llama.cpp + statut du modèle)

---

## 🧪 Test des Endpoints API

### Vérifier la santé du backend :
```powershell
Invoke-WebRequest http://localhost:4000/api/health | Select-Object -ExpandProperty Content
```

Réponse attendue :
```json
{"status":"ok","service":"medistock-api"}
```

### Tester les 6 endpoints principaux :

#### 1. Dashboard (statistiques)
```powershell
curl http://localhost:4000/api/dashboard
```
Retourne : stats (4 médicaments, 2 expirant, 1 en rupture), alertes, mouvements récents

#### 2. Inventaire (médicaments)
```powershell
curl http://localhost:4000/api/inventory?search=&status=ok
```
Retourne : liste des médicaments avec filtres

#### 3. Profils (famille)
```powershell
curl http://localhost:4000/api/profiles
```
Retourne : Danil, Slim, Mamie Jeanne, Claire

#### 4. Historique (mouvements)
```powershell
curl http://localhost:4000/api/history
```
Retourne : 4 entrées d'historique (dates, types, quantités)

#### 5. Statut du modèle local
```powershell
curl http://localhost:4000/api/chat/status
```
Retourne : disponibilité du modèle local (`available`), provider actif (`ollama` / `llama_cpp`), modèle et raison éventuelle d indisponibilité

#### 6. Chat (Assistant IA local)
```powershell
curl -X POST http://localhost:4000/api/chat `
  -H "Content-Type: application/json" `
  -d '{"message":"Quels médicaments sont expirés?"}'
```
Retourne : réponse générée localement + disclaimer de sécurité

---

## ✅ Checklist de Test Complet

- [ ] Backend démarre sans erreur  
- [ ] Frontend chargé sur http://127.0.0.1:5173  
- [ ] `/api/health` retourne `{"status":"ok"}`  
- [ ] Dashboard affiche 4 médicaments + alertes  
- [ ] Inventaire affiche les 4 médicaments filtrables  
- [ ] Profils affiche les 4 membres de la famille  
- [ ] Historique affiche 4 mouvements  
- [ ] Chat répond aux messages  

---

## 🧪 Recette Sprint 6 (repro steps + cas limites)

Objectif:
- Valider la stabilite front/back en conditions reelles.
- Reproduire rapidement les cas limites critiques.

### Parcours de reproduction (Front)

1. Ouvrir `http://127.0.0.1:5173`.
2. Verifier navigation desktop:
  - Dashboard -> Inventaire -> Profils -> Historique -> Notifications -> Assistant.
3. Verifier recherche globale:
  - Saisir une requete dans la barre superieure.
  - Verifier 3 sections de resultats (Inventaire, Profils, Historique).
  - Appliquer les filtres (categorie, statut inventaire, type mouvement).
4. Verifier parcours mobile:
  - Ouvrir les DevTools navigateur et simuler 375x812, 390x844 et 768x1024.
  - Verifier presence de la bottom nav et absence de chevauchement des formulaires/modales.
5. Verifier operations metier:
  - Ajouter/modifier/supprimer un medicament.
  - Enregistrer une prise puis un ajout de stock.
  - Verifier impact dans Historique et Dashboard.

### Cas limites a tester

1. Recherche vide:
  - Vider le champ de recherche globale.
  - Resultat attendu: panneau de resultats ferme, aucune erreur UI.
2. Filtre sans resultat:
  - Requete + filtre strict (ex: categorie Profil + mot inexistant).
  - Resultat attendu: sections avec "Aucun resultat" sans crash.
3. Backend indisponible:
  - Arreter le backend puis rafraichir le front.
  - Resultat attendu: messages d erreur explicites, UI reste utilisable.
4. Charge IA concurrente:
  - Envoyer plusieurs requetes chat simultanees.
  - Resultat attendu: certaines reponses peuvent retourner `503 RESOURCE_EXHAUSTED`, sans blocage serveur.
5. Modele IA absent:
  - Arreter Ollama/llama.cpp puis appeler `/api/chat/status`.
  - Resultat attendu: `available=false` + raison detaillee.

---

## ⚡ Test de charge local (Sprint 6)

Depuis `backend/`:

```powershell
npm run test:load:api
```

Test de charge API + chat local:

```powershell
npm run test:load:chat
```

Note: le script chat utilise un timeout client de 20s pour couvrir `CHAT_TIMEOUT_MS` (15s par defaut) et eviter les faux-negatifs de test.

Personnalisation:

```powershell
node scripts/load-endpoints.mjs --duration=30 --concurrency=25 --timeout=8000 --base-url=http://localhost:4000
node scripts/load-endpoints.mjs --duration=30 --concurrency=8 --include-chat
```

Critere de validation Sprint 6:
- 0 timeout reseau.
- 0 erreur transport.
- Endpoint reste joignable sous charge locale.

---

## 🗄️ Base de Données

**Localisation :** `backend/data/medistock.db` (SQLite local)

**Schéma :**
- `profiles` - 4 entrées (Danil, Slim, Mamie Jeanne, Claire)
- `medicines` - 4 entrées (Metformine, Amoxicilline, Levothyroxine, Ibuprofène)
- `stock_items` - 4 entrées (stock et dates d'expiration)
- `movements` - 4 entrées (historique des mouvements)

**Réinitialiser la DB :**
```powershell
# Supprimer le fichier DB (will be recreated on next backend start)
rm backend/data/medistock.db
# Relancer le backend
```

---

## 🐛 Troubleshooting

### ❌ Erreur Ollama : "Port 11434 déjà utilisé"
```powershell
# Trouver le processus Ollama qui tourne
Get-Process | Where-Object {$_.ProcessName -like "*ollama*"}

# Ou tuer directement avec le port
netstat -ano | findstr :11434
taskkill /PID <PID> /F

# Puis relancer
ollama serve
```

### ❌ Erreur : "Port 4000 déjà utilisé"
```powershell
# Trouver le processus qui utilise le port 4000
Get-Process | Where-Object { $_.Handles -like "*4000*" }

# Ou tuer directement
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

### ❌ Erreur : "Cannot find module"
```powershell
# Réinstaller les dépendances
rm -r backend/node_modules
npm install --prefix backend

rm -r frontend/node_modules
npm install --prefix frontend
```

### ❌ Frontend ne charge pas
```powershell
# Vérifier que le backend est accessible
curl http://localhost:4000/api/health

# Si pas accessible, relancer le backend
npm run dev --prefix backend
```

### ❌ Erreur SQLite "database is locked"
```powershell
# Attendre 2-3 secondes ou relancer le backend
# C'est normal au démarrage (initialisation du schéma)
```

---

## 📝 Architecture Locale

```
PHARMACIE/
├── frontend/                    # React 19 + Vite
│   ├── src/
│   │   ├── App.tsx             # Pages & routing
│   │   ├── main.tsx            # Entry point
│   │   └── index.css           # Design system
│   └── package.json            # Scripts: dev, build
│
├── backend/                     # Node.js + Express
│   ├── src/
│   │   ├── server.ts           # API REST (8 endpoints)
│   │   └── db.ts               # SQLite + seed data
│   ├── data/
│   │   └── medistock.db        # Base de données SQLite
│   ├── scripts/
│   │   └── load-endpoints.mjs  # Test de charge local
│   └── package.json            # Scripts: dev, build, start, test:load*
│
└── SETUP.md                     # Ce fichier
```

---

## 🚀 Prochaines Étapes

1. Ajouter tests automatises (integration API + e2e front) pour remplacer la recette manuelle.
2. Ajouter pipeline CI pour executer `npm run build` et `npm run test:load:api` sur environnement local dedie.
3. Affiner la performance bundle frontend (code splitting) pour reduire le poids JS.

---

## 💬 Support

En cas de problème :
1. Vérifier les logs terminal (erreurs TypeScript, port en conflit)
2. Vérifier que Node.js >= 24.0
3. Réinstaller les dépendances (`npm install`)
4. Relancer les serveurs

---

**Dernière mise à jour :** 17 mars 2026  
**Version :** 1.1 du projet MediStock AI
