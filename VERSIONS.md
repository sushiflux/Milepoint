# Versions

Quick-glance snapshot of what's actually running - not a history (see [CHANGELOG.dev.md](CHANGELOG.dev.md)
for that). Update the matching row whenever a version actually changes in the project. "Latest
available" is re-checked at the start of every session, not just filled in once.

| Component | Current version | Latest available | Check for updates |
|---|---|---|---|
| .NET | 10.0.11 | 10.0.11 | https://dotnet.microsoft.com/download/dotnet |
| Node.js | 24 (Alpine) | 24 (Active LTS) | https://nodejs.org/en/download |
| React | 19.2.8 | 19.2.8 | https://github.com/facebook/react/releases |
| Vite | 8.2.2 | 8.2.2 | https://github.com/vitejs/vite/releases |
| TypeScript | 6.0.3 | 7.0.2 (needs typescript-eslint support first - see note) | https://github.com/microsoft/TypeScript/releases |
| Tailwind CSS | 4.3.3 | 4.3.3 | https://github.com/tailwindlabs/tailwindcss/releases |
| PostgreSQL | 18.6 (Alpine) | 18.6 | https://www.postgresql.org/docs/release/ |
| SQL Server | 2025 | 2025 | https://learn.microsoft.com/en-us/sql/sql-server/what-s-new-in-sql-server |
| Redis | 8 (Alpine) | 8.10.1 | https://github.com/redis/redis/releases |
| Caddy | 2 (Alpine) | 2.11.4 | https://github.com/caddyserver/caddy/releases |
| Whisper ASR Webservice | v1.10.0 (optional, `whisper` profile) | v1.10.0 | https://hub.docker.com/r/onerahmet/openai-whisper-asr-webservice/tags |

**TypeScript 7.0 note** (checked 2026-08-28, decision: wait): TypeScript 7 is a from-scratch
native (Go-based) compiler with no stable programmatic API yet - Microsoft has said that's coming
in 7.1, which itself is still nightly-only (`7.1.0-dev.*`, no stable release). Because of that,
`typescript-eslint` can't hook into it at all yet - not just a conservative peer range, its
canary build (`typescript-eslint@canary`) is *still* capped at `typescript: '>=4.8.4 <6.1.0'`,
with no TS 7 work visible in progress. Forcing the install wouldn't reliably work even with
`--force`. Staying on 6.0.3 (the last classic-compiler release before 7.0) until both TS 7.1
ships stable and `typescript-eslint` adds support - re-check `npm view typescript-eslint
peerDependencies` and `npm view typescript-eslint@canary peerDependencies` before attempting 7.x
again.

Sources: `backend/src/Milepoint.Api/Milepoint.Api.csproj` (.NET), `frontend/Dockerfile.dev` /
`backend/Dockerfile.dev` (Node, .NET SDK base images), `frontend/package.json` (React, Vite,
TypeScript, Tailwind), `docker-compose.yml` (PostgreSQL, SQL Server, Redis, Caddy, Whisper).
