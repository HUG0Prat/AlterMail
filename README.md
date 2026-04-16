# AlterMail V2.0.0

> Application Electron de gestion des candidatures en alternance.

## ✨ Nouvelles fonctionnalités v2

### 📄 Lettre de motivation → PDF

La lettre est automatiquement convertie en PDF (via `pdfkit`) et jointe au mail, garantissant un format professionnel et universel.

### 👤 Profils multiples

Créez et gérez plusieurs profils indépendants :

* CV distincts
* Lettres de motivation personnalisées
* Configurations SMTP / IMAP
* Modèles d’email

Idéal pour postuler à différents secteurs ou types de postes.

### 📬 Conversations fusionnées

La vue "Conversations" regroupe :

* Les emails envoyés
* Les réponses reçues

Chaque candidature est présentée sous forme de timeline claire et lisable.

### 🔔 Notifications système

* Réception d’une réponse (IMAP) → notification OS
* Nouvelle offre LinkedIn → notification OS

Aucune action requise, tout est automatique.

### ✏️ Édition exceptionnelle avant envoi

Avant chaque envoi, un modal permet de modifier :

* Objet
* Corps du mail
* Lettre de motivation

Permet un contrôle total sans casser l’automatisation.

### 🧪 Test de connexion complet

Test simultané :

* SMTP (envoi)
* IMAP (réception)

Retour détaillé avec messages d’erreur explicites.

### 📁 Accès aux données

Bouton "Mes données" :
→ ouvre directement le dossier `userData` d’Electron

Permet :

* Sauvegarde
* Modification manuelle
* Debug

---

## 🚀 Installation

```bash
npm install
npm start
```

### 🛠 Build (optionnel)

```bash
npm run build
```

---

## ⚙️ Configuration

### 📧 Gmail

1. Activez la **validation en 2 étapes**
2. Allez dans **Sécurité → Mots de passe des applications**
3. Générez un mot de passe pour "AlterMail"
4. Utilisez ce mot de passe dans l’application

⚠️ Le mot de passe principal Google ne fonctionne pas.

---

## 📝 Variables dynamiques

Utilisez des variables pour automatiser vos candidatures :

```
Objet   : Candidature {poste} chez {entreprise_name}
Corps   : Veuillez trouver... pour le poste de {poste}.
LM      : Je postule chez {entreprise_name} situé à {ville}.
```

### 🔄 Fonctionnement

* Un seul formulaire unifié
* Remplacement automatique des variables
* Réduction des erreurs et gain de temps

Variables disponibles :

* `{poste}`
* `{entreprise_name}`
* `{ville}`

---

## 📬 Gestion des emails

### Envoi

* SMTP sécurisé
* Pièces jointes automatiques (CV + LM PDF)
* Personnalisation dynamique

### Réception

* IMAP avec synchronisation
* Détection des réponses
* Filtrage par domaine entreprise

---

## 🔒 Confidentialité

* Données stockées **localement uniquement**
* Aucun tracking
* Aucun serveur externe utilisé (hors API LinkedIn)

Détails :

* CV et LM → stockage local
* Emails → métadonnées minimales
* Réponses IMAP → seul le domaine est conservé

---

## 🧠 Architecture

* Electron (Main + Renderer)
* IPC sécurisé via `preload.js`
* Isolation du contexte activée (`contextIsolation`)

---

## 📁 Structure du projet

```
AlterMail/
├── src/
│   ├── main/
│   │   ├── main.js       # Process principal Electron + IPC
│   │   └── preload.js    # Bridge sécurisé
│   └── renderer/
│       ├── index.html    # UI principale
│       ├── app.js        # Logique front complète
│       └── styles/
│           └── main.css  # Styles UI
├── assets/
├── userData/             # Données utilisateur (généré)
└── package.json
```

---

## 🐞 Debug & logs

* Logs console Electron (main + renderer)
* Test de connexion intégré
* Accès direct au dossier utilisateur

---

## 📌 Roadmap (suggestion)

- [ ] Templates avancés (rich text)
- [ ] Relances automatiques
- [ ] Multi-langue
- [ ] Statistiques de candidatures