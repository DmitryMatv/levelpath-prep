# Spec 03: Dockerized api

## Goal

The Nest app ships as an image. `docker compose build api` builds it, `docker compose up` boots db and api together, and `curl localhost:3000/purchase-orders` with a tenant header works against the containerized app, which reaches Postgres as `db:5432` inside the compose network. The 1337 door stays host-only for tests and dev.

## What this teaches

- **Multi-stage builds.** The build stage installs everything and compiles; the runtime stage installs only production dependencies and copies the compiled output. Dev tools, TypeScript, and the source never enter the shipped image.
- **Layer caching.** `package.json` and `package-lock.json` are copied and `npm ci` runs before any source is copied, so changing app code does not re-download dependencies.
- **Config as environment.** The image contains no `.env`. In the container, `POSTGRES_HOST=db` and `POSTGRES_PORT=5432` come from compose `environment`, which lands in `process.env`, which `ConfigService` reads as fallback when there is no `.env` file. Same code, two config sources, zero changes.
- **Compose networking.** Service names become DNS names on the internal network. `db` resolves inside compose; `127.0.0.1:1337` means nothing there.
- **`depends_on` with a health condition.** The api waits for `db` to pass its `pg_isready` healthcheck, not merely for the container to exist.
- **Least privilege.** The runtime image drops to the built-in `node` user, and the app role `tenant_app` (not the superuser) is what the container connects with.

## Files

| File | Change |
| --- | --- |
| `Dockerfile` | new: two stages, `node:24-alpine` |
| `.dockerignore` | new: keeps `node_modules`, `.env`, `.git`, build output, tests, and specs out of the build context |
| `docker-compose.yml` | add `api` service with `depends_on: {db: {condition: service_healthy}}` |
| `.env`, `.env.example` | add `API_PORT=3000` |
| `README.md` | add a short quick start at the top |

Note on version parity: local Node is v26; the image pins `node:24-alpine`, the current LTS line. Deliberate: ship on LTS, pin the tag, and consider a digest pin before this image is published anywhere.

## Dockerfile shape

Stage 1 `build`: copy lockfiles, `npm ci` (full dev deps so `nest build` exists), copy `nest-cli.json`, tsconfigs, `src/`, run `npm run build`.

Stage 2 runtime: copy lockfiles, `npm ci --omit=dev`, clean the npm cache, copy `dist/` from the build stage, `USER node`, `EXPOSE 3000`, `CMD ["node", "dist/main.js"]`.

## Compose `api` service

- `build: .`
- ports: `'${API_PORT:-3000}:3000'` (host door : container door, same rule as the db service)
- environment: `POSTGRES_HOST=db`, `POSTGRES_PORT=5432`, plus `POSTGRES_DB`, `TENANT_APP_USER`, `TENANT_APP_PASSWORD` interpolated from `.env`. No superuser password in the api container; it does not need it.
- `depends_on: db: condition: service_healthy`

## Test plan

1. User runs `sudo docker compose build api && sudo docker compose up -d`.
2. Agent curls from the host through the 3000 door: Acme list, Globex list, 401 without header, 404 on foreign id. These pass through the containerized app, proving the `db:5432` path.
3. Existing host-side tests are unaffected: `npm test` (unit) and `npm run test:e2e` still run against `127.0.0.1:1337`.
4. If the api fails to start: `sudo docker compose logs api`.

Known footgun to watch for: running the host dev server (`npm run start:dev`) and the compose api at the same time both bind host port 3000. Stop one, or set `PORT` for the dev server.

## Acceptance

- image builds, both services come up healthy in one `docker compose up`
- curl walkthrough through the container succeeds for both tenants
- lint, unit, e2e, build all still green on the host
- no agent commits; you review and commit
