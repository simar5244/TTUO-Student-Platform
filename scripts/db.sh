#!/bin/bash
# Local dev Postgres controls: ./scripts/db.sh start|stop|status|psql
DIR="$(cd "$(dirname "$0")/.." && pwd)"
case "$1" in
  start)  pg_ctl -D "$DIR/pgdata" -l "$DIR/pgdata/server.log" -o "-p 5433 -c listen_addresses=localhost -c unix_socket_directories=/tmp" start ;;
  stop)   pg_ctl -D "$DIR/pgdata" stop ;;
  status) pg_ctl -D "$DIR/pgdata" status ;;
  psql)   psql -h localhost -p 5433 -U postgres -d april_app ;;
  *) echo "usage: $0 start|stop|status|psql" ;;
esac
