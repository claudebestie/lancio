"""
generate_blog_lancio.py
Génère 5 articles SEO Q&A niches par semaine pour lancio.fr
Topics dynamiques via Claude + push GitHub + indexation Google + Netlify build
"""
import anthropic
import os
import json
import re
import base64
import time
import requests
from datetime import datetime
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
NETLIFY_HOOK = os.environ.get("NETLIFY_BUILD_HOOK", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "claudebestie")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "lancio")
ARTICLES_PER_RUN = int(os.environ.get("ARTICLES_PER_RUN", "5"))
SITE_URL = "https://lancio.fr"

# ── Secteurs & niches ─────────────────────────────────────────────────────────
SECTEURS = {
    "restaurant": {
        "professions": ["restaurateur", "pizzeria", "brasserie", "traiteur", "food truck", "bar à vin"],
        "angles": ["menu en ligne", "réservation en ligne", "Google Maps", "avis clients", "livraison", "Instagram vs site", "carte digitale"]
    },
    "coiffeur": {
        "professions": ["coiffeur", "barbier", "salon de coiffure", "coloriste"],
        "angles": ["prise de RDV en ligne", "galerie avant/après", "fidélisation clients", "Google My Business", "Instagram vs site"]
    },
    "avocat": {
        "professions": ["avocat", "notaire", "huissier", "médiateur", "juriste indépendant"],
        "angles": ["déontologie en ligne", "formulaire de contact", "spécialisation", "référencement local", "prise de RDV"]
    },
    "medecin": {
        "professions": ["médecin généraliste", "dentiste", "dermatologue", "pédiatre", "kiné", "ostéopathe", "ophtalmologue", "sage-femme"],
        "angles": ["prise de RDV", "Doctolib vs site perso", "téléconsultation", "RGPD santé", "horaires en ligne"]
    },
    "coach": {
        "professions": ["coach sportif", "personal trainer", "prof de fitness", "préparateur physique", "coach bien-être"],
        "angles": ["booking en ligne", "témoignages clients", "avant/après", "réseaux sociaux vs site", "programmes en ligne"]
    },
    "artisan": {
        "professions": ["plombier", "serrurier", "électricien", "peintre en bâtiment", "menuisier", "maçon", "carreleur", "couvreur", "chauffagiste"],
        "angles": ["urgences et SEO local", "devis en ligne", "zone d'intervention", "Google Ads vs SEO", "avis clients", "photos de réalisations"]
    },
    "therapeute": {
        "professions": ["psychologue", "psychothérapeute", "hypnothérapeute", "sophrologue", "naturopathe", "acupuncteur", "réflexologue"],
        "angles": ["RDV en ligne", "confidentialité", "spécialisation affichée", "blog thérapeutique", "Doctolib vs site perso"]
    },
    "immobilier": {
        "professions": ["agent immobilier", "mandataire immobilier", "promoteur", "gestionnaire de biens", "chasseur d'appartements"],
        "angles": ["annonces intégrées", "visite virtuelle", "estimation en ligne", "SEO immobilier local", "portails vs site perso"]
    },
    "cafe": {
        "professions": ["café", "bar", "salon de thé", "boulangerie-pâtisserie", "glacier"],
        "angles": ["horaires et Google", "carte en ligne", "ambiance photos", "événements", "commande en ligne"]
    },
    "beaute": {
        "professions": ["esthéticienne", "prothésiste ongulaire", "maquilleur professionnel", "spa", "institut de beauté"],
        "angles": ["galerie avant/après", "tarifs en ligne", "booking en ligne", "réseaux sociaux vs site", "carte de soins"]
    },
    "pilates": {
        "professions": ["studio de pilates", "prof de pilates", "prof de yoga", "studio de yoga", "salle de sport indépendante"],
        "angles": ["planning des cours", "réservation en ligne", "témoignages", "vidéos démo", "tarifs et abonnements"]
    },
}

QUESTION_TEMPLATES = [
    "Un {profession} a-t-il vraiment besoin d'un site web en 2026 ?",
    "{profession_cap} : Instagram ou site web, que choisir ?",
    "Comment un {profession} peut trouver des clients grâce à Google ?",
    "Un {profession} peut-il prendre des rendez-vous directement depuis son site ?",
    "Combien coûte un site web pour un {profession} en France ?",
    "Faut-il afficher ses tarifs sur son site quand on est {profession} ?",
    "Site web pour {profession} : les 5 erreurs qui font fuir les clients",
    "Un {profession} peut-il se passer de réseaux sociaux avec un bon site ?",
    "Comment apparaître en premier sur Google quand on est {profession} ?",
    "Google My Business vs site web pour un {profession} : le vrai comparatif",
    "{profession_cap} : comment créer un site web rapidement sans se ruiner ?",
    "Pourquoi les clients ne trouvent pas votre activité de {profession} en ligne ?",
    "Peut-on créer un site web de {profession} en 48h ?",
    "Quelles pages doit contenir le site web d'un {profession} ?",
    "Un {profession} a-t-il besoin d'un blog sur son site ?",
    "Facebook suffit-il pour un {profession} ou faut-il un site web ?",
    "{profession_cap} : Wix, WordPress ou site sur mesure ?",
    "Comment un {profession} peut automatiser ses prises de rendez-vous en ligne ?",
    "Les avis Google sont-ils suffisants pour un {profession} sans site web ?",
    "Quel retour sur investissement pour le site web d'un {profession} ?",
]


# ── Topic generation ──────────────────────────────────────────────────────────

def get_existing_slugs():
    """Récupère tous les slugs déjà publiés depuis Supabase"""
    try:
        res = sb.table("lancio_blog_posts").select("slug").execute()
        return [r["slug"] for r in res.data]
    except Exception:
        return []


def generate_topics(existing_slugs):
    """Génère des topics Q&A niches via Claude"""
    secteurs_summary = json.dumps(
        {k: {"professions": v["professions"], "angles": v["angles"]} for k, v in SECTEURS.items()},
        ensure_ascii=False, indent=2
    )

    prompt = f"""Tu es un expert SEO pour Lancio (lancio.fr), agence française de création de sites web en 48h pour €650.

Génère exactement {ARTICLES_PER_RUN} sujets d'articles de blog UNIQUES au format Q&A niche.

SECTEURS ET PROFESSIONS DISPONIBLES :
{secteurs_summary}

EXEMPLES DE TEMPLATES DE QUESTIONS (inspire-toi mais varie) :
{json.dumps(QUESTION_TEMPLATES[:10], ensure_ascii=False)}

SLUGS DÉJÀ PUBLIÉS (NE PAS RÉUTILISER) :
{json.dumps(existing_slugs[-50:], ensure_ascii=False)}

RÈGLES :
1. Chaque sujet doit être une QUESTION que le professionnel taperait sur Google
2. Varier les secteurs : maximum 2 articles du même secteur
3. Varier les angles : prix, RDV, SEO, réseaux sociaux, fonctionnalités, etc.
4. Les slugs doivent être uniques et ne pas ressembler aux slugs existants
5. Chaque question doit cibler un mot-clé SEO précis

Retourne UNIQUEMENT un JSON array de {ARTICLES_PER_RUN} objets :
[
  {{
    "slug": "serrurier-besoin-site-web",
    "title": "Un serrurier a-t-il vraiment besoin d'un site web ?",
    "description": "Découvrez pourquoi un site web est devenu indispensable pour un serrurier qui veut trouver des clients locaux.",
    "secteur": "artisan",
    "keyword": "site web serrurier"
  }}
]

JSON UNIQUEMENT, pas de texte avant ou après."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    text = msg.content[0].text.strip()
    # Extraire le JSON s'il est dans un bloc de code
    json_match = re.search(r'\[.*\]', text, re.DOTALL)
    if json_match:
        text = json_match.group()

    topics = json.loads(text)

    # Valider et filtrer
    valid_topics = []
    for t in topics:
        if all(k in t for k in ("slug", "title", "description", "secteur", "keyword")):
            if t["slug"] not in existing_slugs:
                valid_topics.append(t)

    return valid_topics[:ARTICLES_PER_RUN]


# ── Article generation ────────────────────────────────────────────────────────

PROMPT_TEMPLATE = """Tu es expert SEO et rédacteur web pour Lancio (lancio.fr), une agence française qui crée des sites web professionnels en 48h à partir de €650.

Écris un article de blog en FRANÇAIS de 1200-1500 mots sur le sujet suivant :

TITRE (question) : {title}
SECTEUR CIBLÉ : {secteur}
MOT-CLÉ SEO : {keyword}

Règles impératives :
1. Structure Q&A :
   - H1 = le titre exact (la question)
   - Introduction : réponse directe en 2-3 phrases percutantes
   - 3-4 H2 qui développent la réponse avec du contenu concret
   - Section "## Questions fréquentes" avec 4-5 sous-questions en ### et réponses courtes
   - Conclusion + CTA
2. Mentionne "Lancio" et "lancio.fr" naturellement 2-3 fois (pas plus)
3. Prix de référence : à partir de €650, livraison en 48h
4. Ton : professionnel mais accessible — on parle à des commerçants et artisans français
5. CTA final : lien vers https://lancio.fr/#commander ou https://lancio.fr/#mockup
6. Optimisé SEO : mot-clé "{keyword}" dans le H1, intro et au moins 2 H2
7. Du vrai contenu rédigé, des paragraphes — pas de listes à puces excessives
8. Ajoute des exemples concrets et des chiffres quand possible

FORMAT : Markdown pur. Commence DIRECTEMENT par # {title}
Ne mets PAS de bloc de code. Ne commence PAS par "Voici" ou "Bien sûr"."""


def slugify(text):
    text = text.lower()
    text = re.sub(r'[àáâã]', 'a', text)
    text = re.sub(r'[éèêë]', 'e', text)
    text = re.sub(r'[îï]', 'i', text)
    text = re.sub(r'[ôö]', 'o', text)
    text = re.sub(r'[ùûü]', 'u', text)
    text = re.sub(r'[ç]', 'c', text)
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')


def generate_article(topic):
    """Génère le contenu via Claude"""
    prompt = PROMPT_TEMPLATE.format(**topic)
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text


def save_to_supabase(topic, content, date_str):
    """Enregistre dans Supabase"""
    sb.table("lancio_blog_posts").insert({
        "slug": topic["slug"],
        "title": topic["title"],
        "description": topic["description"],
        "secteur": topic["secteur"],
        "content": content,
        "published_at": date_str,
        "status": "published",
        "source": "auto",
    }).execute()
    print(f"  ✓ Supabase: {topic['slug']}")


def build_astro_content(topic, content, date_str):
    """Construit le contenu du fichier .md Astro"""
    frontmatter = f"""---
title: "{topic['title'].replace('"', "'")}"
description: "{topic['description'].replace('"', "'")}"
date: "{date_str}"
permalink: "{topic['slug']}"
secteur: "{topic['secteur']}"
---

"""
    return frontmatter + content


def save_astro_file(topic, content, date_str):
    """Crée le fichier .md pour Astro (local fallback)"""
    full_content = build_astro_content(topic, content, date_str)
    path = f"src/content/blog/{date_str}-{topic['slug'][:50]}.md"
    os.makedirs("src/content/blog", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(full_content)
    print(f"  ✓ Fichier local: {path}")
    return path


def push_to_github(topic, content, date_str):
    """Push le fichier .md directement sur GitHub via API"""
    if not GITHUB_TOKEN:
        print("  ⚠ Pas de GITHUB_TOKEN — skip push GitHub")
        return False

    full_content = build_astro_content(topic, content, date_str)
    file_path = f"src/content/blog/{date_str}-{topic['slug'][:50]}.md"

    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{file_path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }

    # Vérifier si le fichier existe déjà (pour le sha)
    existing = requests.get(url, headers=headers)
    data = {
        "message": f"blog: {topic['title'][:60]}",
        "content": base64.b64encode(full_content.encode("utf-8")).decode("ascii"),
        "branch": "main",
    }
    if existing.status_code == 200:
        data["sha"] = existing.json()["sha"]

    res = requests.put(url, headers=headers, json=data)
    if res.status_code in (200, 201):
        print(f"  ✓ GitHub: {file_path}")
        return True
    else:
        print(f"  ✗ GitHub error ({res.status_code}): {res.text[:200]}")
        return False


# ── Google indexing ───────────────────────────────────────────────────────────

def submit_to_google(slugs):
    """Soumet les nouvelles URLs à Google via sitemap ping"""
    sitemap_url = f"{SITE_URL}/sitemap.xml"
    ping_url = f"https://www.google.com/ping?sitemap={sitemap_url}"

    try:
        res = requests.get(ping_url)
        print(f"\n📡 Google sitemap ping: {res.status_code}")
    except Exception as e:
        print(f"\n⚠ Google ping failed: {e}")

    # Log les URLs soumises
    for slug in slugs:
        print(f"  → {SITE_URL}/blog/{slug}/")


# ── Netlify ───────────────────────────────────────────────────────────────────

def trigger_netlify_build():
    """Trigger le build Netlify"""
    if NETLIFY_HOOK:
        r = requests.post(NETLIFY_HOOK)
        print(f"  ✓ Netlify build triggered ({r.status_code})")
    else:
        print("  ⚠ Pas de Netlify build hook configuré")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🗓 Lancio Blog Auto — {date_str}")
    print(f"  Articles par run: {ARTICLES_PER_RUN}")
    print("=" * 50)

    # 1. Récupérer les slugs existants
    existing_slugs = get_existing_slugs()
    print(f"  {len(existing_slugs)} articles déjà publiés")

    # 2. Générer les topics via Claude
    print("\n🧠 Génération des topics…")
    topics = generate_topics(existing_slugs)
    if not topics:
        print("❌ Aucun topic généré. Vérifiez les logs.")
        return

    print(f"  {len(topics)} topics générés:")
    for t in topics:
        print(f"    • [{t['secteur']}] {t['title'][:70]}")

    # 3. Générer et publier chaque article
    success_slugs = []
    for i, topic in enumerate(topics, 1):
        print(f"\n[{i}/{len(topics)}] {topic['title'][:60]}…")
        try:
            content = generate_article(topic)
            save_to_supabase(topic, content, date_str)

            # Push GitHub si dispo, sinon fichier local
            if GITHUB_TOKEN:
                push_to_github(topic, content, date_str)
            else:
                save_astro_file(topic, content, date_str)

            success_slugs.append(topic["slug"])
        except Exception as e:
            print(f"  ✗ Erreur: {e}")
            continue

    # 4. Trigger Netlify build
    if success_slugs:
        trigger_netlify_build()

        # 5. Attendre le build et soumettre à Google
        print("\n⏳ Attente du build Netlify (90s)…")
        time.sleep(90)
        submit_to_google(success_slugs)

    print(f"\n✅ Done — {len(success_slugs)}/{len(topics)} articles publiés")


if __name__ == "__main__":
    main()
