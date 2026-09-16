# Spec 01: DatabaseModule with withTenant

## Goal

Connect the Nest app to the dockerized Postgres as the `tenant_app` role (the role RLS actually applies to), and add one service method, `withTenant(tenantId, run)`, that every future query goes through. After this spec, the app can run tenant-scoped SQL from TypeScript, verified by a test, with no HTTP surface yet.

## What this teaches about Nest

- **Modules.** Nest groups code into `@Module()` classes. `AppModule` is the root that boots everything. `DatabaseModule` will be imported by it. Marking it `@Global()` makes its exported providers injectable everywhere without re-importing, the same way `ConfigModule.forRoot({ isGlobal: true })` works.
- **Dependency injection.** A class never constructs its own dependencies. It declares them in the constructor (`constructor(config: ConfigService)`), and Nest resolves and wires them at startup. That is why there is no `new Pool()` in `main.ts`.
- **Lifecycle hooks.** `OnModuleDestroy` lets the service close the pool when the app shuts down, so connections do not hang.
- **Config from `.env`.** `ConfigModule.forRoot()` loads `.env` at boot; `ConfigService` exposes the values, with `getOrThrow` for anything the app cannot run without.

## Files

| File                                    | Change                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `src/database/database.service.ts`      | new: pool + `withTenant`                                               |
| `src/database/database.module.ts`       | new: `@Global()` module exporting the service                          |
| `src/app.module.ts`                     | import `ConfigModule.forRoot({ isGlobal: true })` and `DatabaseModule` |
| `.env`, `.env.example`                  | add `POSTGRES_HOST`, `TENANT_APP_USER`                                 |
| `package.json`                          | add `pg`, `@nestjs/config`, dev `@types/pg`                            |
| `src/database/database.service.spec.ts` | new: integration test (below)                                          |

## Contract for `withTenant(tenantId, run)`

1. `tenantId` must be a UUID. Anything else throws before touching the database (fail fast, no SQL runs).
2. Take one client from the pool.
3. `BEGIN`.
4. `SELECT set_config('app.tenant_id', $tenantId, true)`. This has the same effect as `SET LOCAL app.tenant_id = ...`, the form used in `db/smoke.sh`, but takes the value as a parameter, so the tenant id can never end up as raw SQL. The `true` flag means transaction-scoped: the value vanishes at COMMIT or ROLLBACK.
5. Run the caller's queries (`run(client)`).
6. `COMMIT`. On any error: `ROLLBACK`, rethrow. The client is always released back to the pool, success or failure.

Pooling note: the app keeps one shared `Pool` (max 10). Connections are reused across requests, which is exactly why the tenant context must be transaction-scoped. A plain `SET app.tenant_id` would leak to whoever uses that pooled connection next; `set_config(..., true)` cannot.

RLS note: the policies in `db/init/03-rls.sql` fail closed. An unset or wrong `app.tenant_id` yields zero rows, not an error and not all rows. `withTenant` never needs to re-check isolation; it only needs to always set the context.

## Deliberately out of scope

- No ORM. The RLS and transaction-scoped session state is the substance here; an ORM would hide it behind its own transaction API. Raw `pg` is the point.
- No HTTP endpoints. That is spec 02.
- No JWT or header-based tenant extraction. Spec 02 stands in with a header; spec 06 territory does the real thing.

## Test plan (`src/database/database.service.spec.ts`)

Requires `docker compose up -d db` first. Runs against the seeded data in `db/init/01-schema.sql`.

1. `withTenant` returns the caller's result and applies the tenant context: Acme sees its two purchase order titles.
2. Unknown but valid tenant UUID: zero rows, no error (fail closed).
3. Non-UUID tenant id (including a `'; DROP TABLE` style string): rejected before any SQL runs.
4. A caller error inside `withTenant` rolls back the whole transaction: a write before the throw does not survive, row count is unchanged, and the pool stays usable for the next call.

## Acceptance

- `npm test` green with the db container up
- `npm run lint` and `npm run build` pass
- No commits from the agent; you review the diff and commit
