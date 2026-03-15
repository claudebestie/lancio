# Lancio — lancio.fr

Site web Astro pour Lancio, agence de création de sites web en 48h pour TPE et PME françaises.

## Stack
- **Framework** : Astro 4
- **Hébergement** : Netlify
- **Formulaires** : Netlify Forms (intégré, zéro config)
- **Fonts** : DM Sans + DM Serif Display (Google Fonts)

## Structure

```
src/
├── layouts/
│   └── Layout.astro          # Layout global (SEO, fonts, CSS vars)
├── components/
│   ├── Nav.astro              # Navigation fixe
│   ├── Hero.astro             # Section hero
│   ├── Secteurs.astro         # Bande défilante secteurs
│   ├── Problem.astro          # Avant/Après
│   ├── Exemples.astro         # Portfolio
│   ├── Process.astro          # Comment ça marche
│   ├── Pricing.astro          # Tarifs + add-ons
│   ├── Temoignages.astro      # Témoignages clients
│   ├── FAQ.astro              # FAQ accordéon
│   ├── Commander.astro        # Formulaire brief + CTA final
│   └── Footer.astro           # Pied de page
└── pages/
    ├── index.astro                     # Landing page principale
    ├── 404.astro                       # Page 404
    ├── mentions-legales/index.astro    # Légal
    ├── site-web-restaurant/index.astro # SEO secteur
    ├── site-web-coiffeur/index.astro
    ├── site-web-avocat/index.astro
    ├── site-web-medecin/index.astro
    └── site-web-coach-sportif/index.astro
```

## Installation locale

```bash
npm install
npm run dev
```

## Déploiement Netlify

### Option 1 — Via interface Netlify
1. Pusher ce repo sur GitHub
2. Se connecter à [netlify.com](https://netlify.com)
3. "Add new site" → "Import an existing project"
4. Sélectionner le repo GitHub
5. Build command: `npm run build`
6. Publish directory: `dist`
7. Déployer

### Option 2 — Via Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify deploy --build --prod
```

## Configuration post-déploiement

### 1. Domaine personnalisé
Dans Netlify : Site settings → Domain management → Add custom domain → `lancio.fr`

### 2. Formulaire Netlify
Le formulaire dans `Commander.astro` utilise Netlify Forms. Activer dans :
Netlify → Forms → Enable form detection

### 3. Google Search Console
- Ajouter la property `https://lancio.fr`
- Vérifier via DNS TXT record (Netlify DNS)
- Soumettre `https://lancio.fr/sitemap.xml`

### 4. Hreflang (important pour le SEO)
Le Layout inclut déjà les balises hreflang :
```html
<link rel="alternate" hreflang="fr" href="https://lancio.fr" />
<link rel="alternate" hreflang="en" href="https://getmizra.com" />
```
Ajouter la réciproque sur getmizra.com.

### 5. Stripe (paiement)
Remplacer le formulaire Netlify par une intégration Stripe Checkout :
- Créer un compte Stripe France
- Ajouter la clé publique dans les variables d'environnement Netlify
- Utiliser Stripe Payment Links pour commencer simplement

### 6. Google Analytics
Ajouter dans `Layout.astro` avant `</head>` :
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

## Pages SEO à créer ensuite (vague 2)

### Pages secteur
- `/site-web-artisan/`
- `/site-web-therapeute/`
- `/site-web-barbier/`
- `/site-web-photographe/`

### Pages géo (format : secteur + ville)
- `/site-web-restaurant-paris/`
- `/site-web-restaurant-lyon/`
- `/site-web-avocat-paris/`
- `/site-web-coiffeur-lyon/`
- `/site-web-medecin-marseille/`

## Variables d'environnement Netlify

```
# À créer dans Netlify → Environment variables
STRIPE_PUBLIC_KEY=pk_live_...
CONTACT_EMAIL=hello@lancio.fr
```

## Personnalisation rapide

### Changer les couleurs
Dans `Layout.astro`, modifier les variables CSS :
```css
--accent: #1A3C34;          /* Vert foncé principal */
--accent-light: #2A5C52;    /* Vert hover */
--accent-pale: #E8F0EE;     /* Fond vert pâle */
```

### Changer le nombre de sites livrés
Dans `Hero.astro` et `Temoignages.astro` :
```
47 sites livrés → mettre à jour manuellement
```

### Mettre à jour les témoignages
Dans `Temoignages.astro`, modifier le tableau `temoignages`.

### Ajouter un exemple de site
Dans `Exemples.astro`, ajouter un objet dans le tableau `exemples`.
