-- Multi-tenant demo schema for RLS practice.
-- Tenants + one business table (purchase orders), every row tagged with tenant_id.

CREATE TABLE tenants (
  id          uuid PRIMARY KEY,
  name        text NOT NULL
);

CREATE TABLE purchase_orders (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  title       text NOT NULL,
  total_cents integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_orders_tenant_idx ON purchase_orders (tenant_id);
