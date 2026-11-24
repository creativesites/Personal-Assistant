# Zuri backend on Google Cloud

One Compute Engine VM runs the whole backend with Docker Compose
(`docker-compose.prod.yml` + `docker-compose.gcp.yml`). Cloud Run was ruled
out: Baileys needs exactly one long-lived process per WhatsApp session with a
persistent auth directory, and intelligence runs 26 in-process schedulers that
must be a single always-on instance.

| Resource | Value |
|---|---|
| Project | `propzi-imbk` |
| Region / zone | `europe-west2` / `europe-west2-b` (London — next to Supabase eu-west-1) |
| VM | `zuri-backend` (e2-standard-2, Debian 12, 40 GB pd-balanced) |
| Static IP | `34.13.48.134` |
| Public API | `https://34-13-48-134.sslip.io` (Caddy → nginx → api, Let's Encrypt) |
| Images | `europe-west2-docker.pkg.dev/propzi-imbk/zuri/{api,whatsapp,intelligence}` |
| Prod env | Secret Manager `zuri-prod-env` (written to `/opt/zuri/.env` on each deploy) |
| VM service account | `zuri-vm@propzi-imbk.iam.gserviceaccount.com` |
| Database | Supabase **transaction pooler** (port 6543) — the session pooler (5432) caps at 15 clients |

## Deploy

Push to `main` → `.github/workflows/deploy.yml` (once the one-time setup below
is done). Manually from a laptop:

```bash
PROJECT=propzi-imbk deploy/gcp/deploy.sh   # deploys origin/main
```

`deploy.sh` builds the three images in Cloud Build, then SSHes to the VM and
runs `vm-deploy.sh` (pull secret → pull images → migrations → `up -d` →
health check).

## Operate

```bash
gcloud compute ssh zuri-backend --project propzi-imbk --zone europe-west2-b
cd /opt/zuri
C="sudo docker compose -f docker-compose.prod.yml -f docker-compose.gcp.yml"
$C ps
$C logs -f --tail=100 whatsapp
```

Change a prod env var: edit and add a new secret version, then redeploy.

```bash
gcloud secrets versions access latest --secret=zuri-prod-env --project propzi-imbk > /tmp/zuri.env
$EDITOR /tmp/zuri.env
gcloud secrets versions add zuri-prod-env --project propzi-imbk --data-file=/tmp/zuri.env && rm /tmp/zuri.env
```

WhatsApp auth lives in the `zuri-prod_wa_sessions` Docker volume on the VM
disk — redeploys and restarts keep sessions (they auto-restore).

## One-time: GitHub Actions → GCP (Workload Identity Federation)

Run once with an owner account. Only pushes to `main` of
`creativesites/Personal-Assistant` can impersonate the deployer.

```bash
P=propzi-imbk
PN=$(gcloud projects describe $P --format='value(projectNumber)')
SA=zuri-deployer@$P.iam.gserviceaccount.com
REPO=creativesites/Personal-Assistant

gcloud iam service-accounts create zuri-deployer --display-name="Zuri GitHub deployer" --project $P
for r in roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.admin \
         roles/serviceusage.serviceUsageConsumer roles/logging.viewer \
         roles/compute.instanceAdmin.v1 roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA --role=$r --condition=None --quiet
done

gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions" --project $P
gcloud iam workload-identity-pools providers create-oidc github --location=global \
  --workload-identity-pool=github --project $P \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding $SA --project $P \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

gh secret set GCP_WIF_PROVIDER -R $REPO -b "projects/$PN/locations/global/workloadIdentityPools/github/providers/github"
gh secret set GCP_DEPLOY_SA   -R $REPO -b "$SA"
```

Until both secrets exist the deploy workflow skips itself (green, no-op).
