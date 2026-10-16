# Market Watcher

Suivi de cotations Yahoo Finance ou Crédit Agricole et de l'écart au cours
cible. L'application est composée d'un frontend React et d'une API FastAPI
déployables séparément sur Kubernetes.

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

`GET /api/quotes/{symbol}?target={prix}` renvoie le cours récent, sa devise et
l'écart signé au cours cible (cours actuel moins objectif : positif si le cours
dépasse l'objectif, négatif s'il est inférieur). Le cours actuel est affiché
avec trois décimales. L'objectif est exprimé dans la devise renvoyée pour le
titre. Le frontend actualise l'affichage toutes les 30 secondes.

- Yahoo Finance (par défaut) : `GET /api/quotes/UBI.PA?target=25` renvoie les
  points intrajournaliers. Les réponses sont mises en cache en mémoire pendant
  30 secondes.
- Crédit Agricole : préciser `provider=credit-agricole`, utiliser un ISIN dans
  `{symbol}` et saisir dans l'interface les tokens `Authorization` et
  `X-Authorization` fournis par Crédit Agricole. L'API ajoute également les
  en-têtes applicatifs et navigateur nécessaires à la requête sur
  `Authorization: Bearer <token>`. L'API appelle
  `https://api.ca-titres.fr/bel/v1/products/{isin}/025`. Les tokens ne sont
  jamais ajoutés à l'URL ni persistés ; ils restent uniquement en mémoire dans l'interface
  pour permettre l'actualisation automatique. Ce fournisseur ne fournit qu'un
  cours courant ; le navigateur enregistre donc chaque valeur récupérée et
  reconstitue l'historique localement. Il est propre au navigateur utilisé et
  commence à la première cotation suivie ; il n'est pas synchronisé avec
  d'autres appareils. Le code place est `025` (Euronext Paris).

Les données sont fournies par les services externes correspondants, sans
garantie de disponibilité ni de délai de cotation. L'application ne fabrique
pas de points pendant les périodes sans récupération réussie d'une cotation.

## Déploiement

Les manifests Kubernetes ciblent le namespace `market-watcher`, Traefik et
cert-manager, à l'image du dépôt Gallery. Le workflow publie les images
`docker.redby.fr/market-watcher/{api,frontend}` pour `linux/amd64` et
`linux/arm64`, puis actualise leurs tags dans `infra/`.

Le workflow publie anonymement sur `docker.redby.fr`. Le cluster doit
synchroniser le dossier `infra/` (ou recevoir les manifests par le mécanisme de
déploiement habituel) et disposer du cluster issuer `letsencrypt-prod`.