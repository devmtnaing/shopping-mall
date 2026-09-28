#!/bin/sh
# Restore a backup over the database at DATABASE_URL:  restore.sh [mall-<time>.dump | latest]
# Replaces every table the dump contains. Env: DATABASE_URL and the server's S3_* settings.
set -eu -o pipefail
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
aws configure set default.s3.addressing_style "${S3_URL_STYLE:-path}"
s3() { aws --endpoint-url "$S3_ENDPOINT" s3 "$@"; }

name="${1:-latest}"
if [ "$name" = latest ]; then
  name=$(s3 ls "s3://$S3_BUCKET/backups/" | awk '{print $4}' | grep '^mall-.*\.dump$' | sort | tail -n 1)
  [ -n "$name" ] || { echo "restore: no backups in s3://$S3_BUCKET/backups/" >&2; exit 1; }
fi
echo "restore: $name"
s3 cp "s3://$S3_BUCKET/backups/$name" /tmp/restore.dump
pg_restore --clean --if-exists --no-owner --no-acl --single-transaction -d "$DATABASE_URL" /tmp/restore.dump
echo "restore: done"
