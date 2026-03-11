# MediStock AI - Distribution des taches (2 personnes)

Realise par: Danil et Slim
Source: DossierDeConceptionPHASE1.pdf

## 1) Objectif du projet
Concevoir une application de gestion de stock de pharmacie familiale, avec:
- Un moteur de gestion (Core) fiable pour les calculs de stock
- Un assistant IA local pour la saisie en langage naturel et la vulgarisation

Contraintes fondamentales:
- Confidentialite totale: aucune donnee de sante envoyee a des serveurs tiers
- Separation stricte Core/IA: l IA ne modifie pas les calculs critiques d inventaire
- Temps de reponse:
  - Interactions classiques (navigation, recherche, prise): moins de 2 secondes
  - Requetes IA locales: jusqu a 15 secondes

## 2) Stack retenue pour ce projet
- Frontend: React (web responsive)
- Backend: Node.js (API CRUD)
- Base locale: SQLite
- IA locale: Ollama ou Llama.cpp (modele local quantize)

## 3) Architecture imposee (3 poles)
1. Interface utilisateur (Frontend)
- Gestion de l inventaire et du chat IA
- Responsive desktop/mobile

2. Moteur de gestion + base locale (Backend/Core)
- Operations CRUD
- Gestion des peremptions
- Gestion des profils familiaux
- Stockage local uniquement

3. Moteur IA local (Edge AI)
- Interpretation langage naturel (NLP)
- Aide a la comprehension des notices
- Aucune API IA externe (OpenAI/Gemini interdites)

## 4) Fonctionnalites obligatoires (cahier des charges)
1. Dashboard
- 4 cartes: total medicaments, stock critique, proche peremption, rupture
- Graphique barres des niveaux de stock
- Liste alertes actives (severite couleur)
- Timeline des derniers mouvements
- Acces rapide profils familiaux

2. Inventaire et gestion du stock
- Grille visuelle + niveau de stock
- Recherche textuelle
- Filtres: critique, proche peremption, rupture
- Formulaire ajout (modale)
- Fiche detaillee (dosage, forme, peremption, emplacement, notes)
- Actions rapides: enregistrer prise, ajouter stock

3. Profils familiaux
- Types: Gestionnaire principal, Patient chronique, Senior, Aidant familial
- Fiche detaillee par profil
- Formulaire: type, nom, date de naissance, allergies, notes

4. Historique des mouvements
- Timeline chronologique par jour
- Filtres par type de mouvement et profil
- Statistiques mensuelles

5. Navigation et interface
- Sidebar desktop
- Bottom nav mobile
- Barre superieure: recherche globale, notifications, avatar

6. Fonctionnalite IA
- Chat integre
- Bulles conversation utilisateur/assistant
- Suggestions rapides cliquables
- Indicator typing
- Message d accueil
- Zone de saisie + bouton envoi

## 5) Donnees a stocker (minimum)
Entites:
- Profil/Beneficiaire
- Fiche Medicament
- Stock/Boite
- Evenement/Historique

Relations logiques:
- Un Profil peut avoir 0..n boites
- Une Fiche Medicament peut avoir 0..n boites
- Une Boite peut avoir 0..n evenements
- La suppression d une boite ne supprime pas son historique global

## 6) Distribution des taches (Danil et Slim)
## Sprint 0 - Initialisation et architecture
- Danil (Frontend React):
  - Initialiser application React
  - Structure navigation (Dashboard, Inventaire, Profils, Historique, Chat)
  - Base responsive (desktop/mobile)
- Slim (Backend Node):
  - Initialiser API Node.js
  - Mettre en place SQLite locale
  - Mettre en place structure Core/Modules

## Sprint 1 - Base de donnees + CRUD + roles
- Danil:
  - Ecrans CRUD profils
  - Ecrans CRUD inventaire (liste + ajout)
- Slim:
  - Modeles DB: Profil, Medicament, Boite, Historique
  - Endpoints CRUD
  - Gestion des roles/profils familiaux

## Sprint 2 - Inventaire complet + profils
- Danil:
  - Recherche + filtres inventaire
  - Fiche detaillee + actions rapides (prise/ajout stock)
- Slim:
  - Regles alertes (stock critique/peremption)
  - Journalisation des mouvements
  - API filtres et historique

## Sprint 3 - IA locale et chat
- Danil:
  - Interface chat complete (bulles, suggestions, typing)
- Slim:
  - Integration Ollama/Llama.cpp local
  - Endpoint requete NLP
  - Disclaimers de securite sur reponses IA

Livrable minimum Sprint 3:
- Application fonctionnelle et utilisable en conditions reelles

## Sprint 4 - Dashboard + notifications + historique
- Danil:
  - Dashboard complet (cartes, graphique, alertes)
  - Page historique timeline
- Slim:
  - Aggregations statistiques
  - Systeme notifications

## Sprint 5 - Responsive avance + recherche globale
- Danil:
  - Optimisation mobile (bottom nav, grilles)
- Slim:
  - API recherche globale et filtres combines
  - Optimisation performances backend

## Sprint 6 - Tests charge + optimisation IA + documentation
- Danil:
  - Ajustements UI finaux
  - Documentation front
- Slim:
  - Optimisation performance IA locale
  - Documentation backend

## 7) Risques et mitigations (cahier des charges)
- R1 Performance LLM locale insuffisante (impact eleve)
  - Mitigation: modele quantize leger + configuration minimale recommandee
- R2 Hallucinations et conseils medicaux errones (impact eleve)
  - Mitigation: disclaimers systematiques + ne pas remplacer un avis medical professionnel
- R3 Saisie des medicaments trop longue (impact moyen)
  - Mitigation: scan code-barres/photo + pre-remplissage + saisie en langage naturel
- R4 Mauvaise adoption seniors (impact eleve)
  - Mitigation: tests utilisateurs des Sprint 3 + simplification des parcours

## 8) Cahier de recette a valider
- ST-01 Chargement initial: affichage en moins de 2 secondes, sans erreur console
- ST-02 Gestion des profils: creation/suppression et attribution des medicaments
- ST-03 Ajout medicament: affichage correct en inventaire
- ST-04 Decrementation stock: stock diminue et historique mis a jour
- ST-05 Alertes: alerte correcte seuil critique/peremption
- ST-06 Requete langage naturel IA: interpretation et reponse utilisateur
- ST-07 Hors-ligne: donnees locales accessibles sans perte
- ST-08 Responsive: sidebar -> bottom nav, pas de chevauchement
