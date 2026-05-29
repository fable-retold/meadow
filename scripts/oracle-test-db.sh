#!/bin/bash
# Oracle Test Database Management Script
#
# Usage:
#   ./scripts/oracle-test-db.sh start   - Start Oracle container, load schema and seed data
#   ./scripts/oracle-test-db.sh stop    - Stop and remove the container
#   ./scripts/oracle-test-db.sh status  - Check if the container is running
#
# Uses gvenzl/oracle-free (Oracle Database 23ai Free — no license required,
# multi-arch so it runs natively on Apple Silicon).  gvenzl auto-creates the
# APP_USER in its own schema inside the FREEPDB1 pluggable database.
#
# The container settings match the test configuration in
# test/Meadow-Provider-Oracle_tests.js and meadow-connection-oracle:
#   Host: 127.0.0.1, Port: 21521, Service: FREEPDB1
#   User: bookstore, Password: Retold1234567890!

CONTAINER_NAME="meadow-oracle-test"
ORACLE_USER="bookstore"
ORACLE_PASSWORD="Retold1234567890!"
ORACLE_SERVICE="FREEPDB1"
ORACLE_PORT="21521"
ORACLE_IMAGE="gvenzl/oracle-free:23-slim"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_GENERATOR="${SCRIPT_DIR}/bookstore-seed.js"

start_oracle() {
	# Check if container already exists
	if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
		if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
			echo "Oracle test container is already running."
			return 0
		else
			echo "Removing stopped container..."
			docker rm "${CONTAINER_NAME}" > /dev/null 2>&1
		fi
	fi

	echo "Starting Oracle test container (first boot pulls the image and initializes the DB; this can take several minutes)..."
	docker run -d \
		--name "${CONTAINER_NAME}" \
		-e ORACLE_PASSWORD="${ORACLE_PASSWORD}" \
		-e APP_USER="${ORACLE_USER}" \
		-e APP_USER_PASSWORD="${ORACLE_PASSWORD}" \
		-p "${ORACLE_PORT}:1521" \
		"${ORACLE_IMAGE}"

	if [ $? -ne 0 ]; then
		echo "ERROR: Failed to start Oracle container."
		exit 1
	fi

	echo "Waiting for Oracle to accept connections (gvenzl healthcheck)..."
	RETRIES=120
	until docker exec "${CONTAINER_NAME}" healthcheck.sh > /dev/null 2>&1; do
		RETRIES=$((RETRIES - 1))
		if [ $RETRIES -le 0 ]; then
			echo "ERROR: Oracle failed to become ready in time."
			docker logs "${CONTAINER_NAME}" 2>&1 | tail -20
			exit 1
		fi
		echo "  ...waiting (${RETRIES} retries left)"
		sleep 5
	done

	# Load bookstore schema and seed data (GUIDs minted at generation time via fable-uuid)
	if [ -f "${SEED_GENERATOR}" ]; then
		echo "Loading bookstore schema and seed data..."
		node "${SEED_GENERATOR}" --dialect oracle | \
			docker exec -i "${CONTAINER_NAME}" sqlplus -S "${ORACLE_USER}/${ORACLE_PASSWORD}@//localhost:1521/${ORACLE_SERVICE}"
		if [ $? -ne 0 ]; then
			echo "WARNING: Failed to load seed data. Tests requiring pre-populated data may fail."
		else
			echo "Bookstore schema and seed data loaded successfully."
		fi
	else
		echo "WARNING: Seed generator not found at ${SEED_GENERATOR}. Skipping schema/data loading."
	fi

	echo ""
	echo "Oracle test database is ready!"
	echo "  Container: ${CONTAINER_NAME}"
	echo "  Host:      127.0.0.1:${ORACLE_PORT}"
	echo "  Service:   ${ORACLE_SERVICE}"
	echo "  User:      ${ORACLE_USER}"
	echo "  Password:  ${ORACLE_PASSWORD}"
	echo ""
	echo "Run tests with: npm test"
}

stop_oracle() {
	if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
		echo "Stopping and removing Oracle test container..."
		docker stop "${CONTAINER_NAME}" > /dev/null 2>&1
		docker rm "${CONTAINER_NAME}" > /dev/null 2>&1
		echo "Oracle test container removed."
	else
		echo "No Oracle test container found."
	fi
}

status_oracle() {
	if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
		echo "Oracle test container is running."
		docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
		echo "Oracle test container exists but is stopped."
	else
		echo "Oracle test container is not running."
	fi
}

case "${1}" in
	start)
		start_oracle
		;;
	stop)
		stop_oracle
		;;
	status)
		status_oracle
		;;
	*)
		echo "Usage: $0 {start|stop|status}"
		exit 1
		;;
esac
