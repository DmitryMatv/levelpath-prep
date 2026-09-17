# Spec 02: purchase-orders API with tenant extraction

## Goal

A REST surface over the RLS-backed `withTenant` from spec 01. The tenant comes from an `x-tenant-id` header (stand-in for a JWT claim), a guard validates it, and every service query runs inside `withTenant`. After this spec, RLS is proven end to end: HTTP request in, tenant-isolated rows out, with e2e tests and a curl walkthrough.

## What this teaches about Nest

- **Controllers and routing.** `@Controller('purchase-orders')` plus `@Get`, `@Post`, `@Patch`, `@Delete`; `@Param('id')` and `@Body()`.
- **Guards.** `@UseGuards(TenantGuard)` on the controller. A guard runs before the handler and can short-circuit by throwing. This is the right home for "who is asking".
- **Custom param decorators.** `@TenantId()` extracts what the guard stashed on the request, so handlers read intent (`tenantId`) not transport (`headers`).
- **DTO validation.** `class-validator` decorators on DTO classes plus one global `ValidationPipe`. Registered through the `APP_PIPE` provider in `AppModule` rather than `app.useGlobalPipes` in `main.ts`: DI-registered providers also apply inside e2e tests, where `main.ts` never runs.
- **`@Global()` in practice.** `PurchaseOrdersModule` imports nothing. `DatabaseService` is injectable because `DatabaseModule` is global.

## Endpoints

| Method | Path                   | Success           | Errors                                      |
| ------ | ---------------------- | ----------------- | ------------------------------------------- |
| GET    | `/purchase-orders`     | 200, own orders   | 401 no header, 400 malformed header         |
| GET    | `/purchase-orders/:id` | 200               | 404 unknown or foreign id                   |
| POST   | `/purchase-orders`     | 201 + created row | 400 invalid body                            |
| PATCH  | `/purchase-orders/:id` | 200 + updated row | 404 unknown or foreign id, 400 invalid body |
| DELETE | `/purchase-orders/:id` | 204               | 404 unknown or foreign id                   |

## Design decisions

- **Header stand-in.** A real system reads the tenant from a verified JWT. The guard here only checks that `x-tenant-id` is a well-formed UUID. It is a boundary check, not authorization: RLS remains the thing that actually enforces isolation. Worth saying out loud in the interview.
- **Explicit tenant passing over AsyncLocalStorage.** `tenantId` travels as a plain function argument from guard to decorator to service. Node's AsyncLocalStorage is the common alternative (ambient request context, no threading through signatures), but it hides the data flow and adds async-context subtleties. Explicit wins while learning.
- **Cross-tenant reads return 404, not 403.** RLS filters the row out, so the app cannot tell "exists elsewhere" from "does not exist". That kills the existence oracle for free. Do not "fix" this into a 403.
- **The API never accepts `tenant_id`.** The service inserts the context tenant. Even a hand-crafted request with extra fields is stripped/rejected by the ValidationPipe, and RLS `WITH CHECK` would reject a mismatched insert anyway. Defense in depth, not a single wall.
- **UUIDs generated in Node** (`crypto.randomUUID`), not a schema default. Keeps one statement with `RETURNING` and avoids touching the schema, which would require re-initializing the volume (init scripts run once; see step 1 debugging).

## Files

| File                                                    | Change                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/common/is-uuid.ts`                                 | new: shared UUID check                                             |
| `src/common/tenant.guard.ts`                            | new: extracts and validates `x-tenant-id`                          |
| `src/common/tenant-id.decorator.ts`                     | new: `@TenantId()` param decorator                                 |
| `src/purchase-orders/purchase-orders.module.ts`         | new                                                                |
| `src/purchase-orders/purchase-orders.controller.ts`     | new                                                                |
| `src/purchase-orders/purchase-orders.service.ts`        | new: all SQL lives here, each call wrapped in `withTenant`         |
| `src/purchase-orders/dto/create-purchase-order.dto.ts`  | new: `title` string, `totalCents` non-negative int                 |
| `src/purchase-orders/dto/update-purchase-order.dto.ts`  | new: partial version for PATCH                                     |
| `src/purchase-orders/entities/purchase-order.entity.ts` | new: camelCase row shape                                           |
| `src/app.module.ts`                                     | register `PurchaseOrdersModule` + `APP_PIPE`                       |
| `src/database/database.service.ts`                      | reuse `isUuid` from common                                         |
| `package.json`                                          | add `class-validator`, `class-transformer`, `@nestjs/mapped-types` |
| `test/purchase-orders.e2e-spec.ts`                      | new: supertest suite (below)                                       |

Hand-written instead of `nest g resource` because the scaffold generates TypeORM-flavored boilerplate we would delete.

## Test plan

- `npm test` (unit): existing suites stay green.
- `npm run test:e2e` against the running db:
  1. Acme lists exactly its 2 seeded orders.
  2. Globex lists exactly its 2.
  3. Missing header → 401; malformed header → 400.
  4. Acme POSTs an order, sees it in the list, DELETEs it, list back to 2.
  5. Acme GET/PATCH/DELETE on a Globex id → 404 every time, and Globex data is untouched.
  6. Unknown id → 404 (indistinguishable from foreign id).
- `node dist/main.js` + curl for a manual walkthrough of both tenants.

## Acceptance

- unit + e2e tests, lint, build all green
- curl output shows tenant separation through the app
- no agent commits; you review and commit
