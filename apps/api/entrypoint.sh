#!/bin/sh
set -e

# Retry alembic up to 6 times (30s each = 3 min total) to handle DB cold starts
_run_migrations() {
    n=0
    until [ "$n" -ge 6 ]; do
        alembic upgrade head && return 0
        n=$((n+1))
        echo "Migration attempt $n/6 failed, retrying in 30s..."
        sleep 30
    done
    echo "ERROR: migrations failed after 6 attempts, aborting"
    return 1
}

_run_migrations
exec uvicorn presentation.main:app --host 0.0.0.0 --port "${PORT:-8000}"
