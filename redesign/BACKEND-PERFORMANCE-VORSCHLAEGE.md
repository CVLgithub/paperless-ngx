# Backend-Performance — Vorschläge (nicht umgesetzt)

Diese Vorschläge stammen aus einer Performance-Analyse der Redesign-Oberfläche (2026-11-24).
Das Backend (`src/`, Image `ghcr.io/paperless-ngx/paperless-ngx:3.5.1`) wurde dabei **nicht** verändert —
alle Punkte hier sind reine Empfehlungen. Reihenfolge ≈ erwarteter Nutzen für das Laden von Vorschaubildern und Listen.

## Messwerte (Testinstanz, 156 Dokumente, 2026-11-24)

| Messung | Wert |
|---|---|
| Thumbnail `200` (serverseitig) | Median 63 ms, Median 26 KB |
| Thumbnail `304` (Revalidierung) | Median 39 ms, für 50 Karten zusammen 2,3 s |
| Webserver | **1** Granian-Worker; Django führt synchrone Views unter ASGI auf einem Thread pro Worker aus, die Thumbnail-Requests laufen also praktisch nacheinander |
| PDF-Größen | Median 2,5 MB, p90 8,9 MB, max. 17 MB |
| Range-Requests auf `/preview/` | nicht unterstützt (`Range` → `200`, ganze Datei) |
| Seitenaufruf (Liste + 50 Thumbs parallel) | 1 Worker: 8,4 s → **3 Worker: 3,7 s** (Testinstanz seit 2026-11-24 auf `PAPERLESS_WEBSERVER_WORKERS=3`) |

---

## 1. Vorschaubilder (`/api/documents/<id>/thumb/`) dauerhaft cachebar machen

**Ist-Zustand** (`documents/views.py`, `thumb()`):
`@cache_control(no_cache=True)` + `condition(etag=checksum, last_modified=…)`.
Jede Karte löst bei jedem Seitenaufruf einen Revalidierungs-Request aus (meist `304`), der serverseitig
trotzdem Dokument-Lookup, Berechtigungsprüfung und ETag-Berechnung kostet. Bei 50–100 Karten pro Seite
sind das 50–100 Roundtrips, auf dem Pi spürbar.

**Vorschlag:**
- Wenn die URL einen Versionsparameter trägt (z. B. `?v=<checksum>` oder `?v=<modified-timestamp>`), Antwort mit
  `Cache-Control: private, max-age=31536000, immutable` ausliefern. Ohne Parameter bisheriges Verhalten beibehalten (abwärtskompatibel).
- `checksum` bzw. ein `thumbnail_version` im Listen-Serializer mitliefern, damit die UI den Parameter setzen kann.
- UI-Seite (Folgeänderung, sobald das Backend das kann): `getThumbUrl(id, version)` hängt `v=` an.

## 2. Kleinere Thumbnail-Variante für Listenzeilen

Die Listenansicht zeigt Vorschaubilder in ~40 px Breite, lädt aber das volle Thumbnail (~400–500 px WebP).
Vorschlag: zusätzliche kleine Variante (z. B. 160 px) beim Konsumieren erzeugen und per `?size=small`
ausliefern; UI kann dann `srcset`/`sizes` nutzen.

## 3. Seiten-Thumbnails für die Detailansicht

Der Seitenstreifen links in der Detailansicht zeigt für Seite 2+ nur Platzhalter. Ein Endpoint
`/api/documents/<id>/thumb/?page=N` (on demand erzeugt + gecacht) würde echte, kleine Seitenbilder ermöglichen,
ohne das ganze PDF clientseitig rendern zu müssen.

## 4. HTTP-Range-Requests für `/preview/` und `/download/`

Django-`FileResponse` beantwortet keine `Range`-Header. pdf.js kann Range-Requests nutzen, um die erste Seite
zu rendern, bevor das ganze PDF geladen ist (wichtig bei großen Scans). Optionen:
- `django-ranged-response` o. ä. für `preview`,
- oder Auslieferung über `X-Accel-Redirect`/`X-Sendfile` durch einen vorgeschalteten Server.
Danach kann die UI in pdf.js `disableAutoFetch`/`rangeChunkSize` sinnvoll einsetzen.

## 5. `include_selection_data` in der Dokumentenliste

`/api/documents/?include_selection_data=true` berechnet Zählungen für alle Tags, Korrespondenten, Typen,
Speicherpfade und Custom Fields über die komplette gefilterte Menge. Das ist die teuerste Komponente des
Listen-Requests. Vorschläge:
- Ergebnis pro (Benutzer, Filter-Hash) kurz in Redis cachen (invalidieren bei Dokumentänderung).
- UI-seitig umgesetzt: Die Liste fordert es nur noch an, solange das erweiterte Filterpanel offen ist bzw. alle
  Dokumente ausgewählt sind. Gemessen (154 Dokumente, 50/Seite): 489 ms → 367 ms pro Listen-Request; mit offenem
  Panel 452 ms. Mit Caching wäre auch der Panel-Fall günstig.

## 6. Listen-Endpoint: Abfragen schlanker machen

- Prüfen, ob `select_related`/`prefetch_related` für `tags`, `notes`, `custom_fields`, `owner` und
  Berechtigungen im Listenfall greifen (N+1 bei `notes`-Zählung / Berechtigungen).
- Der `fields=`-Parameter wird bereits unterstützt; die UI nutzt ihn jetzt (Payload 84 KB → 13 KB pro Seite).
  Serverseitig sollte das dann auch teure Annotationen (z. B. Notizen, Berechtigungen) überspringen, nicht nur
  die Serialisierung.

## 7. Statische Frontend-Dateien langfristig cachen

Aktuell: `Cache-Control: max-age=60, public`, Dateinamen ohne Hash (`outputHashing: none`), Kompression
on-the-fly durch `StreamAwareCompressionMiddleware` (chunked, CPU pro Request).
Vorschläge:
- Gehashte Dateinamen (`outputHashing: all`) + `WHITENOISE_IMMUTABLE_FILE_TEST`, damit JS/CSS als
  `immutable` gecacht werden; nur `index.html` kurz cachen.
- Vorkomprimierte `.br`/`.gz`-Dateien werden jetzt im `ui-builder` erzeugt und von WhiteNoise direkt ausgeliefert
  (`main.js` 1,0 MB → 190 KB Brotli, mit `content-length`, ohne CPU pro Request).
- Seit dem Lazy-Loading der Routen gibt es nachladbare Chunks. Wegen `max-age=60` auf `main.js` kann ein Browser
  kurz nach einem Deploy noch eine alte `main.js` haben, die nicht mehr vorhandene Chunks anfragt. Gehashte
  Dateinamen + `immutable` (siehe oben) würden das sauber lösen.

## 8. Infrastruktur (Caddy / Webserver)

- Caddy: `encode zstd gzip` im Site-Block, damit Kompression nicht im Python-Prozess passieren muss;
  HTTP/2/3 ist bei Caddy mit TLS standardmäßig aktiv (wichtig für viele parallele Thumbnail-Requests).
- `PAPERLESS_WEBSERVER_WORKERS` auf dem Pi an die CPU-Kerne anpassen, damit parallele Thumbnail-Requests
  nicht hinter einem langsamen Listen-Request warten.
