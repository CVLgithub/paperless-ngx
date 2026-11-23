# Paperless-ngx Redesign — Eigenständige Test-Instanz

Dieses Verzeichnis enthält das vollständige Docker-Compose-Setup für die eigenständige Test-Instanz des **Paperless-ngx UI-Redesigns** auf Basis von **Paperless-ngx `v3.5.1`**.

> **Hinweis zur Isolation:** Diese Test-Instanz nutzt einen eigenen Compose-Projektnamen (`paperless-redesign`), eigene benannte Volumes und eine eigene PostgreSQL- und Redis-Instanz. Sie teilt weder Daten noch Netzwerkverbindungen mit anderen Paperless-Instanzen.

---

## Architektur

- **Backend:** Offizielles Image `ghcr.io/paperless-ngx/paperless-ngx:3.5.1` (fest auf das exakte Release-Tag gepinnt, kein `latest`).
- **Oberfläche (Frontend):** Aus `../src-ui` im Node-Container (`ui-builder`, Profil `build`) gebaut und nur lesend (`:ro`) über `/usr/src/paperless/static/frontend` in den Webserver eingehängt. Auf dem Host ist kein Node.js erforderlich.
- **Fonts & Icons:** Ausschließlich lokal ausgeliefert (`system-ui` + selbst gehostetes `InterVariable.woff2` sowie lokale SVGs aus `bootstrap-icons`). Keine CDNs, keine externen Schriftarten, keine Apple-Assets.
- **Sprache & Zeitzone:** Standardmäßig Deutsch (`de-de`, OCR `deu` + `eng`, `Europe/Berlin`).

---

## Ersteinrichtung

1. **Umgebungsdatei anlegen:**
   ```bash
   cd paperless-ngx/redesign
   cp .env.example .env
   chmod 600 .env
   ```
2. **Zufällige Zugangsdaten in `.env` eintragen** (niemals in Git einchecken!):
   - `POSTGRES_PASSWORD` (z. B. `openssl rand -base64 24`)
   - `PAPERLESS_SECRET_KEY` (z. B. `openssl rand -hex 32`)
   - `PAPERLESS_ADMIN_PASSWORD` (z. B. `openssl rand -base64 18`)
3. **Oberfläche bauen und Stack starten:**
   ```bash
   ./build-ui.sh
   docker compose up -d
   ```

---

## Port-Bindung & Erreichbarkeit

Der Webserver bindet **ausschließlich** an folgende Host-Adressen (nicht an `0.0.0.0`):

- **Lokal (Browser-Test auf diesem Rechner):** `http://127.0.0.1:8090`
- **Tailscale (für Docker-Caddy):** `http://100.120.88.96:8090`

Der Host-Port wird über `REDESIGN_HOST_PORT` in `.env` konfiguriert (Standard: `8090`). Container-intern lauscht Paperless-ngx unverändert auf Port `8000`.

### Docker-Caddy (`paperless-r.pi`)

Ein fertiges Snippet für deine Docker-Caddy-Instanz liegt in [`Caddyfile.snippet`](./Caddyfile.snippet). Caddy selbst wird durch dieses Setup **nicht** verändert.

Wichtige Eckpunkte im Snippet:
- `tls internal` für die lokale Domain `paperless-r.pi`
- `reverse_proxy 100.120.88.96:8090` (separater Block für `/ws/*` mit `flush_interval -1` für Live-WebSocket-Updates bei Upload, OCR und Zusammenführen)
- `request_body { max_size 512MB }` für große / mehrseitige PDF-Uploads

---

## Betrieb & Alltag

```bash
# Status prüfen
docker compose ps

# Logs verfolgen
docker compose logs -f webserver

# Oberfläche nach Code-Änderungen neu bauen & Webserver aktualisieren
./build-ui.sh

# Instanz stoppen (Daten bleiben in den benannten Volumes erhalten)
docker compose down

# Instanz inkl. aller Testdaten komplett zurücksetzen (ACHTUNG: löscht alle Volumes!)
docker compose down -v
```

### Tests & Linting (im Node-Container)

```bash
# Unit-Tests für Redesign & Merge-Workflow ausführen
docker compose --profile build run --rm --entrypoint /bin/sh ui-builder -lc \
  "corepack enable && pnpm exec jest src/app/services/merge-workflow.service.spec.ts src/app/components/redesign/ src/app/components/common/confirm-dialog/merge-confirm-dialog/"

# ESLint prüfen
docker compose --profile build run --rm --entrypoint /bin/sh ui-builder -lc \
  "corepack enable && pnpm exec ng lint"
```

---

## Künftige Updates auf neuere Paperless-ngx Releases

Da das Redesign sauber auf einem Feature-Branch (`feature/redesign`) ab dem stabilen Release-Tag `v3.5.1` aufsetzt und das Backend-Image exakt auf dieselbe Version gepinnt ist, läuft ein Update geordnet in 4 Schritten ab:

1. **Upstream-Tags holen:**
   ```bash
   git fetch upstream --tags
   ```
2. **Branch auf das neue stabile Release-Tag rebasen** (z. B. `v3.6.0`):
   ```bash
   git checkout feature/redesign
   git rebase v3.6.0
   ```
   Konflikte (typischerweise in `app-frame`, `document-list`, `document-detail`, `bulk-editor` oder `icons.ts`) auflösen.
3. **Backend-Version in `redesign/docker-compose.yml` angleichen:**
   `image: ghcr.io/paperless-ngx/paperless-ngx:<neue-Version>` (ohne führendes `v`, exakt passend zum Tag).
4. **Oberfläche neu bauen & starten:**
   ```bash
   cd redesign
   ./build-ui.sh
   ```

---

## Screenshots (Desktop 1440 × 960, Hell- & Dunkelmodus)

Alle Verifikations-Screenshots der laufenden Instanz liegen unter [`./screenshots/`](./screenshots/):

| Bereich | Hellmodus | Dunkelmodus |
|---|---|---|
| Dokumentenübersicht & Seitenleiste | [`01-overview-light.png`](./screenshots/01-overview-light.png) | [`02-overview-dark.png`](./screenshots/02-overview-dark.png) |
| Mehrfachauswahl & Aktionsleiste | [`03-multiselect-light.png`](./screenshots/03-multiselect-light.png) | [`04-multiselect-dark.png`](./screenshots/04-multiselect-dark.png) |
| Dokument-Detailansicht & Inspektor | [`05-detail-light.png`](./screenshots/05-detail-light.png) | [`06-detail-dark.png`](./screenshots/06-detail-dark.png) |
| Zusammenführen-Dialog | [`07-merge-light.png`](./screenshots/07-merge-light.png) | [`08-merge-dark.png`](./screenshots/08-merge-dark.png) |
