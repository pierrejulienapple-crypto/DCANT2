#!/usr/bin/env python3
"""
DCANT — Collecte des appellations viticoles
Sources :
  1. INAO via data.gouv.fr (CSV officiel appellations francaises)
  2. eAmbrosia API (UE) — registre europeen des indications geographiques

Usage :
  python3 scripts/collect_appellations.py              # insertion Supabase
  python3 scripts/collect_appellations.py --dry-run    # log sans inserer
"""

import csv
import io
import json
import os
import ssl
import sys
import urllib.request
import urllib.error

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

SUPABASE_URL = "https://cwpmlsmgckxooqtbwbpd.supabase.co"
SUPABASE_KEY = None  # loaded from .env

INAO_CSV_URL = (
    "https://static.data.gouv.fr/resources/"
    "referentiel-des-produits-sous-signe-officiel-didentification-"
    "de-la-qualite-et-de-lorigine-siqo/"
    "20251231-153733/2025-12-31-inao-ref-produit-siqo.csv"
)

EAMBROSIA_API_URL = (
    "https://webgate.ec.europa.eu/eambrosia-api/api/v1/"
    "geographical-indications"
)

BATCH_SIZE = 500

# ISO country codes -> French names (European wine countries)
COUNTRY_NAMES = {
    "FR": "France", "IT": "Italie", "ES": "Espagne", "PT": "Portugal",
    "DE": "Allemagne", "AT": "Autriche", "GR": "Grece", "HU": "Hongrie",
    "RO": "Roumanie", "BG": "Bulgarie", "HR": "Croatie", "SI": "Slovenie",
    "CZ": "Tchequie", "SK": "Slovaquie", "CY": "Chypre", "LU": "Luxembourg",
    "MT": "Malte", "PL": "Pologne", "BE": "Belgique", "NL": "Pays-Bas",
    "GB": "Royaume-Uni", "CH": "Suisse", "GE": "Georgie", "MD": "Moldavie",
    "RS": "Serbie", "MK": "Macedoine du Nord", "ME": "Montenegro",
    "BA": "Bosnie-Herzegovine", "AL": "Albanie", "TR": "Turquie",
    "ZA": "Afrique du Sud", "US": "Etats-Unis", "AR": "Argentine",
    "CL": "Chili", "AU": "Australie", "NZ": "Nouvelle-Zelande",
}

# GI type mapping
GI_TYPE_MAP = {"PDO": "AOP", "PGI": "IGP", "GI": "IG"}


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def log(source, msg):
    print(f"[{source}] {msg}")


def load_env():
    """Load .env file from project root."""
    global SUPABASE_KEY
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env_path = os.path.normpath(env_path)
    if not os.path.exists(env_path):
        print(f"ERREUR: fichier .env introuvable ({env_path})")
        sys.exit(1)
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
    if not SUPABASE_KEY:
        print("ERREUR: SUPABASE_SERVICE_KEY non trouvee dans .env")
        sys.exit(1)
    log("INIT", "Cle Supabase chargee")


def fetch_url(url, headers=None, accept_json=False, skip_ssl=False):
    """Fetch a URL and return the response body as string or parsed JSON."""
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "DCANT-Collector/1.0")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)

    # Use permissive SSL context (macOS Python often lacks system certs)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        resp = urllib.request.urlopen(req, context=ctx, timeout=120)
        data = resp.read()
        text = data.decode("utf-8", errors="replace")
        if accept_json:
            return json.loads(text)
        return text
    except urllib.error.HTTPError as e:
        log("HTTP", f"Erreur {e.code} pour {url}")
        raise
    except Exception as e:
        log("HTTP", f"Erreur: {e}")
        raise


def clean_region(raw):
    """Extract region name from INAO comite_regional field."""
    if not raw:
        return ""
    # e.g. "Comite regional Val de Loire - Centre" -> "Val de Loire - Centre"
    raw = raw.strip()
    prefixes = ["Comite regional ", "Comité régional "]
    for p in prefixes:
        if raw.startswith(p):
            return raw[len(p):]
    return raw


# ──────────────────────────────────────────────
# Source 1 : INAO (data.gouv.fr)
# ──────────────────────────────────────────────

def collect_inao():
    """Collect French wine appellations from INAO CSV."""
    log("INAO", "Telechargement du CSV...")
    try:
        text = fetch_url(INAO_CSV_URL)
    except Exception:
        log("INAO", "ECHEC du telechargement — source ignoree")
        return []

    log("INAO", f"CSV recu ({len(text)} octets)")

    reader = csv.DictReader(io.StringIO(text), delimiter=",")

    seen = set()
    results = []

    for row in reader:
        secteur = (row.get("secteur") or "").strip()
        if secteur != "VITICOLE":
            continue

        nom = (row.get("appellation") or "").strip()
        if not nom:
            continue

        # Deduplicate by (nom)
        key = nom.lower()
        if key in seen:
            continue
        seen.add(key)

        signe_ue = (row.get("signe_ue") or "").strip()
        region = clean_region(row.get("comite_regional") or "")

        results.append({
            "nom": nom,
            "pays": "France",
            "region": region,
            "type": signe_ue or "AOC",
            "source": "INAO",
        })

    log("INAO", f"{len(results)} appellations viticoles collectees")
    return results


# ──────────────────────────────────────────────
# Source 2 : eAmbrosia (UE)
# ──────────────────────────────────────────────

def collect_eambrosia():
    """Collect European wine appellations from eAmbrosia API."""
    log("eAmbrosia", "Telechargement du registre complet...")
    try:
        data = fetch_url(EAMBROSIA_API_URL, accept_json=True, skip_ssl=True)
    except Exception:
        log("eAmbrosia", "ECHEC du telechargement — source ignoree")
        return []

    log("eAmbrosia", f"{len(data)} entrees recues au total")

    # Filter: wines only, registered only
    wines = [
        gi for gi in data
        if gi.get("productType") == "WINE"
        and gi.get("status") == "registered"
        and not gi.get("removedFlag", False)
    ]
    log("eAmbrosia", f"{len(wines)} vins enregistres apres filtrage")

    seen = set()
    results = []

    for gi in wines:
        names = gi.get("protectedNames") or []
        countries = gi.get("countries") or []
        gi_type = gi.get("giType") or ""

        country_code = countries[0] if countries else ""
        country_name = COUNTRY_NAMES.get(country_code, country_code)
        appellation_type = GI_TYPE_MAP.get(gi_type, gi_type)

        for name in names:
            name = name.strip()
            if not name:
                continue

            # Deduplicate by (nom_lower, pays)
            key = (name.lower(), country_name)
            if key in seen:
                continue
            seen.add(key)

            results.append({
                "nom": name,
                "pays": country_name,
                "region": "",
                "type": appellation_type,
                "source": "eAmbrosia",
            })

    log("eAmbrosia", f"{len(results)} appellations viticoles collectees")
    return results


# ──────────────────────────────────────────────
# Deduplication cross-sources
# ──────────────────────────────────────────────

def deduplicate(inao_list, eambrosia_list):
    """
    Merge lists. INAO has priority (inserted first).
    eAmbrosia entries that match (nom, pays=France) from INAO are skipped
    (Supabase UNIQUE constraint handles it, but we reduce noise).
    """
    seen = set()
    merged = []

    # INAO first (priority)
    for item in inao_list:
        key = (item["nom"].lower(), item["pays"].lower())
        seen.add(key)
        merged.append(item)

    # eAmbrosia: skip French entries already in INAO
    skipped = 0
    for item in eambrosia_list:
        key = (item["nom"].lower(), item["pays"].lower())
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        merged.append(item)

    log("MERGE", f"{len(merged)} appellations uniques ({skipped} doublons FR eAmbrosia ignores)")
    return merged


# ──────────────────────────────────────────────
# Supabase insert
# ──────────────────────────────────────────────

def insert_supabase(items, dry_run=False):
    """Insert appellations into Supabase in batches."""
    if dry_run:
        log("DRY-RUN", f"{len(items)} appellations seraient inserees")
        # Show a sample
        for item in items[:10]:
            log("DRY-RUN", f"  {item['nom']} | {item['pays']} | {item['region']} | {item['type']} | {item['source']}")
        if len(items) > 10:
            log("DRY-RUN", f"  ... et {len(items) - 10} autres")
        return

    total_inserted = 0
    total_skipped = 0
    total_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i : i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1

        payload = json.dumps(batch).encode("utf-8")

        # Supabase REST API: POST with Prefer: resolution=ignore-duplicates
        # This implements ON CONFLICT DO NOTHING behavior
        url = f"{SUPABASE_URL}/rest/v1/appellations"
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("apikey", SUPABASE_KEY)
        req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "resolution=merge-duplicates,return=representation")

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        try:
            resp = urllib.request.urlopen(req, context=ctx, timeout=30)
            body = resp.read().decode("utf-8")
            returned = json.loads(body) if body.strip() else []
            inserted = len(returned)
            skipped = len(batch) - inserted
            total_inserted += inserted
            total_skipped += skipped
            log("INSERT", f"Batch {batch_num}/{total_batches}: {inserted} inseres, {skipped} doublons ignores")
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            log("INSERT", f"ERREUR batch {batch_num}: HTTP {e.code} — {error_body[:200]}")
        except Exception as e:
            log("INSERT", f"ERREUR batch {batch_num}: {e}")

    log("INSERT", f"Termine: {total_inserted} inseres, {total_skipped} doublons ignores sur {len(items)} total")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 50)
    print("DCANT — Collecte des appellations viticoles")
    print(f"Mode: {'DRY-RUN (aucune insertion)' if dry_run else 'PRODUCTION (insertion Supabase)'}")
    print("=" * 50)

    if not dry_run:
        load_env()
    else:
        log("DRY-RUN", "Pas de chargement .env en mode dry-run")

    # Collect from both sources
    inao = collect_inao()
    eambrosia = collect_eambrosia()

    if not inao and not eambrosia:
        log("MAIN", "Aucune appellation collectee — abandon")
        sys.exit(1)

    # Merge & deduplicate
    merged = deduplicate(inao, eambrosia)

    if not merged:
        log("MAIN", "Liste vide apres deduplication — abandon")
        sys.exit(1)

    # Stats
    print()
    log("STATS", f"INAO (France):      {len(inao)}")
    log("STATS", f"eAmbrosia (Europe):  {len(eambrosia)}")
    log("STATS", f"Total unique:        {len(merged)}")

    pays_count = {}
    for item in merged:
        p = item["pays"]
        pays_count[p] = pays_count.get(p, 0) + 1
    top = sorted(pays_count.items(), key=lambda x: -x[1])[:10]
    log("STATS", "Top pays: " + ", ".join(f"{p} ({n})" for p, n in top))
    print()

    # Insert
    insert_supabase(merged, dry_run=dry_run)

    print()
    print("=" * 50)
    print("Termine !")
    print("=" * 50)


if __name__ == "__main__":
    main()
