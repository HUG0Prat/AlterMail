# AlterMail

> Application Electron de gestion des candidatures en alternance.

## ✨ Fonctionnalités

### 📄 Lettre de motivation → PDF
La lettre est automatiquement convertie en PDF (via `pdfkit`) et jointe au mail.

### 👤 Profils multiples
Créez et gérez plusieurs profils indépendants (CV, LM, config mail, modèles).

### 📬 Conversations fusionnées
La vue "Conversations" regroupe chaque envoi avec ses réponses dans une timeline déroulante.

### 🔔 Notifications système
- Nouvelle réponse reçue (IMAP) → notification OS
- Nouvelle offre LinkedIn → notification OS

### ✏️ Édition avant envoi
Un modal de confirmation permet de modifier objet, corps et LM avant chaque envoi.

### 🧪 Test de connexion complet
Test SMTP + IMAP simultanés avec feedback détaillé.

### 📁 Accès aux données
Bouton "Mes données" → ouvre le dossier `userData` d'Electron directement.

---

## 🚀 Installation

```bash
npm install
npm start
```

---

## 📧 Configuration Gmail

1. Activez la **validation en 2 étapes** sur votre compte Google
2. Allez dans **Sécurité → Mots de passe des applications**
3. Créez un mot de passe pour "AlterMail"
4. Copiez le mot de passe de 16 caractères dans AlterMail

---

## 📝 Variables dynamiques

```
Objet   : Candidature {poste} chez {entreprise_name}
Corps   : Veuillez trouver... pour le poste de {poste}.
LM      : Je postule chez {entreprise_name} situé à {ville}.
```

Résultat → **un seul formulaire** avec les champs unifiés : `poste`, `entreprise_name`, `ville`.

---

## 🔒 Confidentialité

- CV et LM stockés **localement** dans `userData`
- Pour les réponses IMAP : seul le **domaine** `@entreprise.fr` est enregistré
- Aucune donnée transmise à des serveurs tiers

---

## 📁 Structure

```
AlterMail/
├── src/
│   ├── main/
│   │   ├── main.js       # Electron main + IPC handlers
│   │   └── preload.js    # Bridge contextIsolation
│   └── renderer/
│       ├── index.html
│       ├── app.js        # UI complète
│       └── styles/
│           └── main.css
└── package.json
```
