-- Row-Level Security setup.
-- Rule: a session may only touch rows whose tenant_id matches app.tenant_id.

-- The app connects as tenant_app: not a superuser and not the table owner,
-- so RLS actually applies to it (superusers and owners bypass RLS unless
-- FORCE ROW LEVEL SECURITY is declared).
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO tenant_app;
GRANT SELECT ON tenants TO tenant_app;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- current_setting(..., true) returns NULL (not an error) when unset,
-- so a session that forgot to set the tenant sees ZERO rows. Fail closed.
-- USING filters reads (SELECT/UPDATE/DELETE),
-- WITH CHECK validates writes (INSERT/UPDATE).
CREATE POLICY tenant_isolation ON purchase_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
