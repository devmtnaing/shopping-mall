# Postgres backups to the uploads bucket (docs/deploy.md). Runs once and exits: a daily cron on Railway.
# pg_dump must be at least as new as the server, so PG_MAJOR follows the database's major version.
# Build from the repo root:  docker build -f tools/backup/Dockerfile -t shopping-mall-backup .
ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}-alpine
RUN apk add --no-cache aws-cli
COPY tools/backup/backup.sh tools/backup/restore.sh /usr/local/bin/
ENTRYPOINT ["/bin/sh"]
CMD ["/usr/local/bin/backup.sh"]
