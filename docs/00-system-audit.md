# System-Audit (Stand: 2026-08-12)

Ergebnis der Prüfung des Windows-Rechners vor Projektstart.

## Vorhanden

| Tool | Version | Bemerkung |
|---|---|---|
| Docker Desktop | 29.7.2 (Client) | Engine lief beim Check nicht sauber durch, siehe unten |
| Docker Compose | v5.3.1 | Als Docker-CLI-Plugin vorhanden |
| .NET SDK | 8.0.423 | Auf dem Host installiert. Wird für den Container-Build nicht zwingend gebraucht, ist aber praktisch für IDE-Tooling (IntelliSense) |
| RAM | 64 GB (davon ~49 GB frei) | Reicht bequem für Postgres + MSSQL + App-Container parallel |
| Docker Context | `desktop-linux` (aktiv) | Linux-Container-Modus, das ist der richtige Modus für Postgres-Container |

## Fehlt / auffällig

- **WSL 2 ist nicht installiert** (`wsl --list` meldet "nicht installiert"). Docker Desktop läuft damit vermutlich im Hyper-V-Backend statt WSL2-Backend. Das funktioniert, ist aber spürbar langsamer bei Dateisystem-Mounts (Bind Mounts für Hot-Reload). **Empfehlung:** WSL2-Backend aktivieren (`wsl --install`, dann in Docker Desktop Settings → General → "Use WSL 2 based engine"). Kein Muss, aber deutlich bessere Performance für Vite Hot-Reload.
- **Docker Engine antwortete beim Check mit HTTP 500** auf `docker ps` / `docker info`, obwohl der Docker-Desktop-Prozess läuft. Das deutet auf einen noch nicht vollständig gestarteten oder hängenden Engine-Zustand hin. Vor dem ersten `docker compose up` bitte prüfen, dass das Docker-Desktop-Icon in der Taskleiste "Engine running" (grün) zeigt, sonst ggf. Docker Desktop neu starten.
- **Git ist nicht installiert** (kein `git` im PATH). Wird für Versionskontrolle gebraucht — auch wenn die App komplett in Docker läuft, sollte der Quellcode selbst mit Git verwaltet werden. Das ist der einzige Windows-seitige Zusatz-Install, den ich empfehlen würde, da Git-Operationen (Commits, Branches) sinnvollerweise nativ laufen und nicht in einem Container gekapselt werden sollten.
- **Node/npm nicht auf dem Host installiert** — das ist so gewünscht, Frontend-Tooling läuft im Container.
- VS-Code-CLI (`code`) nicht im PATH gefunden — nicht geprüft, ob VS Code selbst installiert ist, nur ob die CLI verfügbar ist.

## Konsequenz für die Docker-Planung

- Ziel "kaum Nachinstallation auf Windows" ist gut erreichbar: nur **Git für Windows** wird zusätzlich empfohlen, alles andere (.NET SDK-Nutzung im Container, Node, Datenbank-Clients) kann containerisiert werden.
- MSSQL-Container: Microsoft bietet offizielle Linux-Container-Images (`mcr.microsoft.com/mssql/server`), die laufen auch unter dem Linux-Container-Modus von Docker Desktop — **kein** Windows-Container-Modus nötig, trotz "MSSQL für Windows" in der Anfrage. Das vereinfacht die Docker-Compose-Struktur erheblich (ein Engine-Modus für beide DBs).
