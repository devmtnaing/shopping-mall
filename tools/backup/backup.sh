#!/bin/sh
# Dump the database into the bucket as backups/mall-<UTC time>.dump (pg_dump custom format) and keep
# the newest $KEEP (default 30). The server never serves these: /files/ only serves <kind>/<sha256>.<ext>.
# Env: DATABASE_URL and the server's S3_* settings.
set -eu -o pipefail
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
aws configure set default.s3.addressing_style "${S3_URL_STYLE:-path}"
s3() { aws --endpoint-url "$S3_ENDPOINT" s3 "$@"; }

name="backups/mall-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" | s3 cp - "s3://$S3_BUCKET/$name"
echo "backup: wrote $name"

s3 ls "s3://$S3_BUCKET/backups/" | awk '{print $4}' | grep '^mall-.*\.dump$' | sort -r |
  tail -n +"$((${KEEP:-30} + 1))" | while read -r old; do
    s3 rm "s3://$S3_BUCKET/backups/$old"
  done
