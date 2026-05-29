#!/bin/bash
# Meadow Test Database Cleanup Script
#
# Stops and removes all meadow test database containers.
#
# Usage:
#   ./scripts/meadow-test-cleanup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Cleaning up meadow test database containers..."
echo ""

"${SCRIPT_DIR}/mysql-test-db.sh" stop
"${SCRIPT_DIR}/mssql-test-db.sh" stop
"${SCRIPT_DIR}/postgresql-test-db.sh" stop
"${SCRIPT_DIR}/oracle-test-db.sh" stop
"${SCRIPT_DIR}/mongodb-test-db.sh" stop
"${SCRIPT_DIR}/solr-test-db.sh" stop
"${SCRIPT_DIR}/dgraph-test-db.sh" stop

echo ""
echo "Cleanup complete."
