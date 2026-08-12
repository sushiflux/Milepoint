# Projekt-Vision (Rohfassung, wird nach Rückfragen verfeinert)

## Elevator Pitch
Ein selbst gehostetes Projektmanagement-Tool speziell für Softwareentwicklung (Web, Desktop/Programme, Game-Dev),
das die Stärken von **Plane**, **OpenProject** und **Vikunja** (Anm.: "Vakuja" im Ursprungstext, vermutlich Vikunja
gemeint — bitte bestätigen) kombiniert. Fokus: Entwickler-Workflow, nicht generisches Business-PM.

## Nicht-Ziele (vorerst)
- Kein Design/CSS-Feinschliff durch Claude — das übernimmt eine andere KI (siehe Empfehlung im Chat).
- Keine Produktions-Deployment-Strategie in Phase 1 — reine Dev-Umgebung.

## Tech-Stack (Vorschlag des Nutzers, noch zu bestätigen)
- Backend: ASP.NET Core (C#)
- Frontend: React + Vite (TypeScript)
- Datenbanken (parallel testbar): PostgreSQL (Linux-Container) und Microsoft SQL Server (läuft ebenfalls als
  Linux-Container, siehe [00-system-audit.md](00-system-audit.md) — kein Windows-Container-Modus nötig)
- Alles containerisiert via Docker Desktop, minimal Nachinstallation auf Windows (siehe System-Audit)

## Betriebsanforderungen an die Dev-Umgebung
- Docker-Projektordner "PM" unter Docker Desktop
- Ein einziges Start/Stopp-Skript (eine Datei)
  - Prüft benötigte Ports: eigene alte Instanzen werden beendet, fremde Belegungen führen zu Ausweichport
  - Führt einen Healthcheck durch
  - Soll stabil laufen

## Offene Punkte
Siehe laufende Rückfragen im Chat-Verlauf. Dieses Dokument wird nach jeder Antwortrunde aktualisiert.
