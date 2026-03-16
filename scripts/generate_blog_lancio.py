"""
generate_blog_lancio.py
Génère 3 articles SEO par semaine pour lancio.fr
Publie dans Supabase + crée les fichiers Astro + trigger Netlify build
"""
import anthropic
import os
import json
import random
import re
import requests
from datetime import datetime
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
NETLIFY_HOOK = os.environ.get("NETLIFY_BUILD_HOOK", "")

# ── Sujets — rotation par niches ────────────────────────────────────────────────
TOPICS = [
    # Informationnels — coût / prix
    {
        "slug": "combien-coute-site-web-restaurant-france",
        "title": "Combien coûte un site web pour un restaurant en France en 2026 ?",
        "description": "Prix, options et comparatif des solutions pour créer un site web restaurant professionnel en France.",
        "secteur": "restaurant",
        "intent": "informatif",
    },
    {
        "slug": "prix-site-web-artisan-france",
        "title": "Quel budget pour le site web d'un artisan en France ?",
        "description": "Guide complet des tarifs pour créer un site professionnel quand on est artisan, plombier ou électricien.",
        "secteur": "artisan",
        "intent": "informatif",
    },
    {
        "slug": "cout-creation-site-web-avocat",
        "title": "Créer un site web pour avocat : combien ça coûte vraiment ?",
        "description": "Tour complet des prix du marché pour un site de cabinet d'avocat — agence, freelance, ou solution rapide.",
        "secteur": "avocat",
        "intent": "informatif",
    },
    # Comparatifs
    {
        "slug": "agence-web-vs-freelance-vs-lancio",
        "title": "Agence web, freelance ou Lancio : quelle solution choisir pour votre TPE ?",
        "description": "Comparatif honnête des trois options pour créer votre site web professionnel rapidement et sans se ruiner.",
        "secteur": "general",
        "intent": "comparatif",
    },
    {
        "slug": "wix-vs-site-professionnel-sur-mesure",
        "title": "Wix vs site sur mesure : pourquoi les TPE font le mauvais choix",
        "description": "Les vraies différences entre un site Wix gratuit et un site professionnel — et pourquoi ça compte pour votre business.",
        "secteur": "general",
        "intent": "comparatif",
    },
    # Guides pratiques
    {
        "slug": "site-web-coiffeur-guide-complet",
        "title": "Site web pour salon de coiffure : le guide complet 2026",
        "description": "Tout ce que votre site de salon de coiffure doit contenir pour attirer de nouveaux clients et remplir votre agenda.",
        "secteur": "coiffeur",
        "intent": "guide",
    },
    {
        "slug": "site-web-medecin-cabinet-medical",
        "title": "Site web médecin : ce que vos patients cherchent vraiment",
        "description": "Les 7 éléments indispensables d'un site web pour cabinet médical ou généraliste en France.",
        "secteur": "medecin",
        "intent": "guide",
    },
    {
        "slug": "referencement-local-restaurant-google",
        "title": "Comment votre restaurant apparaît en premier sur Google Maps ?",
        "description": "Guide SEO local pour restaurants : Google Business, site web et astuces pour dominer les recherches locales.",
        "secteur": "restaurant",
        "intent": "guide",
    },
    # Témoignages / cas pratiques
    {
        "slug": "site-web-48h-comment-ca-marche",
        "title": "Un site web professionnel en 48h : comment c'est possible ?",
        "description": "Explication complète du process Lancio — comment on livre un site pro en 48h pour 650€ sans rogner sur la qualité.",
        "secteur": "general",
        "intent": "brand",
    },
    {
        "slug": "pourquoi-votre-coach-a-besoin-site-web",
        "title": "Coach sportif sans site web en 2026 : vous perdez des clients chaque jour",
        "description": "Pourquoi un site web est indispensable pour un coach sportif ou personal trainer, et comment en créer un rapidement.",
        "secteur": "coach",
        "intent": "guide",
    },
    # Géo-ciblés
    {
        "slug": "creation-site-web-restaurant-paris",
        "title": "Créer un site web pour votre restaurant à Paris — rapide et pro",
        "description": "Solutions pour créer un site web restaurant professionnel à Paris — prix, délais et options pour tous les budgets.",
        "secteur": "restaurant",
        "intent": "geo",
    },
    {
        "slug": "site-web-artisan-lyon",
        "title": "Site web pour artisan à Lyon : attirez plus de clients locaux",
        "description": "Guide pratique pour les artisans lyonnais qui veulent un site professionnel pour développer leur activité.",
        "secteur": "artisan",
        "intent": "geo",
    },
]

PROMPT_TEMPLATE = """Tu es expert SEO et rédacteur web pour Lancio (lancio.fr), une agence française qui crée des sites web professionnels en 48h à partir de €650.

Écris un article de blog en FRANÇAIS de 900-1100 mots sur le sujet suivant :

TITRE : {title}
SECTEUR CIBLÉ : {secteur}
TYPE D'ARTICLE : {intent}

Règles impératives :
1. Structure : H1 (titre exact), introduction 2-3 phrases percutantes, 3-4 H2 avec contenu, conclusion + CTA
2. Mentionne "Lancio" et "lancio.fr" naturellement 2-3 fois
3. Prix de référence : à partir de €650, livraison 48h
4. Ton : professionnel mais accessible, pas corporate — on parle à des commerçants et artisans
5. CTA final : lien vers https://lancio.fr/#commander avec texte accrocheur
6. Optimisé SEO : mots-clés dans les titres, pas de sur-optimisation
7. Pas de listes à puces excessives — du vrai contenu rédigé

FORMAT : Markdown pur. Commence DIRECTEMENT par # {title} (le H1).
Ne mets PAS de bloc de code. Ne commence PAS par un mot comme "Voici" ou "Bien sûr"."""


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


def already_published(slug):
    """Check si l'article existe déjà dans Supabase"""
    try:
        res = sb.table("lancio_blog_posts").select("slug").eq("slug", slug).execute()
        return len(res.data) > 0
    except Exception:
        return False


def generate_article(topic):
    """Génère le contenu via Claude"""
    prompt = PROMPT_TEMPLATE.format(**topic)
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
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


def save_astro_file(topic, content, date_str):
    """Crée le fichier .md pour Astro"""
    frontmatter = f"""---
title: "{topic['title'].replace('"', "'")}"
description: "{topic['description'].replace('"', "'")}"
date: "{date_str}"
slug: "{topic['slug']}"
secteur: "{topic['secteur']}"
---

"""
    path = f"src/content/blog/{date_str}-{topic['slug'][:50]}.md"
    os.makedirs("src/content/blog", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(frontmatter + content)
    print(f"  ✓ Fichier: {path}")
    return path


def trigger_netlify_build():
    """Trigger le build Netlify"""
    if NETLIFY_HOOK:
        r = requests.post(NETLIFY_HOOK)
        print(f"  ✓ Netlify build triggered ({r.status_code})")
    else:
        print("  ⚠ Pas de Netlify build hook configuré")


def main():
    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🗓 Lancio Blog Auto — {date_str}")
    print("=" * 50)

    # Choisir 3 sujets non encore publiés
    unpublished = [t for t in TOPICS if not already_published(t["slug"])]
    if not unpublished:
        print("Tous les sujets déjà publiés. Renouveler la liste TOPICS.")
        return

    to_publish = random.sample(unpublished, min(3, len(unpublished)))

    for i, topic in enumerate(to_publish, 1):
        print(f"\n[{i}/3] {topic['title'][:60]}…")
        try:
            content = generate_article(topic)
            save_to_supabase(topic, content, date_str)
            save_astro_file(topic, content, date_str)
        except Exception as e:
            print(f"  ✗ Erreur: {e}")
            continue

    trigger_netlify_build()
    print(f"\n✅ Done — {len(to_publish)} articles générés")


if __name__ == "__main__":
    main()
