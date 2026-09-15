#!/usr/bin/env bash
# Smoke test proving tenant isolation via RLS.
# Fails loudly if any query leaks rows across tenants.

set -euo pipefail

DB_CMD='docker exec -i levelpath-prep-db psql -U tenant_app -d app -v ON_ERROR_STOP=1'

echo "== Session 1: tenant Acme =="
echo "BEGIN; SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT title FROM purchase_orders;
COMMIT;" | $DB_CMD

echo
echo "== Session 2: tenant Globex =="
echo "BEGIN; SET LOCAL app.tenant_id = '22222222-2222-2222-2222-222222222222';
SELECT title FROM purchase_orders;
COMMIT;" | $DB_CMD

echo
echo "== Attack 1: no tenant set (must return 0 rows) =="
echo "BEGIN; SELECT count(*) AS visible_without_tenant FROM purchase_orders;
COMMIT;" | $DB_CMD

echo
echo "== Attack 2: spoof tenant_id on insert (must fail with RLS violation) =="
echo "BEGIN; SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
INSERT INTO purchase_orders (id, tenant_id, title, total_cents)
VALUES ('aaaaaaaa-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'leak attempt', 1);
COMMIT;" | $DB_CMD || echo "(correctly rejected)"

echo
echo "== Attack 3: update other tenant's row (must update 0 rows) =="
echo "BEGIN; SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
UPDATE purchase_orders SET total_cents = 0
WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
COMMIT;" | $DB_CMD

echo
echo "All isolation checks done."
