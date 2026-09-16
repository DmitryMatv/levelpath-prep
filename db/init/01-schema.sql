-- Multi-tenant demo schema for RLS practice.
-- Runs as the POSTGRES_USER superuser on first container init.
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  title text NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_orders_tenant_idx ON purchase_orders (tenant_id);
-- Seed data: two tenants must not see each other.
INSERT INTO tenants (id, name)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Acme Corp'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Globex Ltd'
  );
INSERT INTO purchase_orders (id, tenant_id, title, total_cents)
VALUES (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Acme laptops',
    120000
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Acme office chairs',
    45000
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'Globex raw steel',
    900000
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'Globex forklifts',
    320000
  );