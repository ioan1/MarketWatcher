# Market Watcher

Suivi de cotations Yahoo Finance avec un graphique des 24 dernières heures et
l'écart au cours cible. L'application est composée d'un frontend React et d'une
API FastAPI déployables séparément sur Kubernetes.

## Développement local

L'API requiert Python 3.12 ou supérieur.

```sh
cd services/quotes-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Dans un autre terminal :

```sh
cd frontend
npm install
npm run dev
```

Vite relaie `/api` vers `http://localhost:8000`. L'interface est disponible sur
`http://localhost:5173`.

## API

`GET /api/quotes/{symbol}?target={prix}` renvoie le cours récent, la devise, les
points Yahoo Finance de la journée et l'écart entre le cours et l'objectif.
Exemple : `/api/quotes/UBI.PA?target=25`. La réponse est mise en cache en mémoire
pendant 30 secondes ; le frontend actualise l'affichage toutes les 30 secondes.
L'objectif est exprimé dans la devise renvoyée pour le titre.

Les données sont fournies par Yahoo Finance, sans garantie de disponibilité ni
de délai de cotation. L'API ne fabrique pas de points pendant les périodes sans
cotation.

## Déploiement

Les manifests Kubernetes ciblent le namespace `market-watcher`, Traefik et
cert-manager, à l'image du dépôt Gallery. Le workflow publie les images
`docker.redby.fr/market-watcher/{api,frontend}` pour `linux/amd64` et
`linux/arm64`, puis actualise leurs tags dans `infra/`.

Le workflow publie anonymement sur `docker.redby.fr`. Le cluster doit
synchroniser le dossier `infra/` (ou recevoir les manifests par le mécanisme de
déploiement habituel) et disposer du cluster issuer `letsencrypt-prod`.