-- Row-Level Security setup.
-- Rule: a session may only touch rows whose tenant_id matches app.tenant_id.

-- Demo roles a backend would connect as. Not superusers (RLS is bypassed
-- for superusers and table owners unless FORCE ROW LEVEL SECURITY is set).
CREATE ROLE tenant_app LOGIN PASSWORD 'tenant_app';

GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO tenant_app;
GRANT SELECT ON tenants TO tenant_app;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- Permissive policy: USING filters reads (SELECT/UPDATE/DELETE),
-- WITH CHECK validates writes (INSERT/UPDATE).
-- current_setting(..., true) returns NULL (not an error) when unset,
-- so a session that forgot to set the tenant sees ZERO rows. Fail closed.
CREATE POLICY tenant_isolation ON purchase_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Seed data: two tenants must not see each other.
INSERT INTO tenants (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp'),
  ('22222222-2222-2222-2222-222222222222', 'Globex Ltd');

INSERT INTO purchase_orders (id, tenant_id, title, total_cents) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme laptops', 120000),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Acme office chairs', 45000),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Globex raw steel', 900000),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Globex forklifts', 320000);
