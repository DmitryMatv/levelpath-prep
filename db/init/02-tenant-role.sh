#!/usr/bin/env bash
# Creates the limited app role. Password comes from the environment
# (TENANT_APP_PASSWORD passed through docker-compose.yml from .env),
# never from a checked-in SQL file.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v tenant_pw="$TENANT_APP_PASSWORD" <<-'EOF'
CREATE ROLE tenant_app LOGIN PASSWORD :'tenant_pw';
EOF
