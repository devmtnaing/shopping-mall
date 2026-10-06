// The production Railway project as code (docs/deploy.md). Check it against the live project with
// `railway config plan`. Applying from a file that leaves a resource out deletes that resource.
// Secrets stay on Railway: preserve() keeps whatever value is set there.
import { bucket, defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

const REGION = 'asia-southeast1-eqsg3a'; // Singapore: closest to most visitors

export default defineRailway(() => {
  const repo = github('devmtnaing/shopping-mall', { checkSuites: false });

  const Postgres = postgres('Postgres', { region: REGION });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 5000,
  });
  const uploads = bucket('uploads', { region: 'sin' });

  // the same bucket settings for the server and the backup job
  const s3 = {
    S3_ENDPOINT: '${{uploads.ENDPOINT}}',
    S3_BUCKET: '${{uploads.BUCKET}}',
    S3_ACCESS_KEY_ID: '${{uploads.ACCESS_KEY_ID}}',
    S3_SECRET_ACCESS_KEY: '${{uploads.SECRET_ACCESS_KEY}}',
    S3_REGION: '${{uploads.REGION}}',
    S3_URL_STYLE: 'virtual',
  };
  const dockerfile = (path: string, watchPatterns: string[]) => ({
    buildEnvironment: 'V3',
    builder: 'DOCKERFILE',
    dockerfilePath: path,
    watchPatterns,
  });
  const app = ['shared/**', 'mall.config.ts', 'pnpm-lock.yaml'];

  const server = service('server', {
    source: repo,
    build: dockerfile('server/Dockerfile', ['server/**', ...app]),
    healthcheck: '/health',
    replicas: { [REGION]: 1 },
    env: {
      RAILWAY_DOCKERFILE_PATH: 'server/Dockerfile',
      PORT: '8787',
      DATABASE_URL: '${{Postgres.DATABASE_URL}}',
      ...s3,
      HOST_SECRET: preserve(),
      ROOM_CAPACITY: '100',
      // emails to approved applicants and new shop owners (server/src/mail.ts); the key, sender and
      // reply-to address live in Railway
      RESEND_API_KEY: preserve(),
      MAIL_FROM: preserve(),
      MAIL_REPLY_TO: preserve(),
      // Resend's webhook signing secret: bounce and delivery reports (server/src/mail-events.ts)
      RESEND_WEBHOOK_SECRET: preserve(),
      PUBLIC_URL: 'https://mall.devmtnaing.com',
    },
  });

  const web = service('web', {
    source: repo,
    build: dockerfile('client/Dockerfile', ['client/**', ...app]),
    healthcheck: '/',
    replicas: { [REGION]: 1 },
    env: {
      RAILWAY_DOCKERFILE_PATH: 'client/Dockerfile',
      PORT: '8080',
      API_UPSTREAM: '${{server.RAILWAY_PRIVATE_DOMAIN}}:8787',
      // mall.devmtnaing.com is behind Cloudflare's proxy: visitors' addresses come from CF-Connecting-IP
      CLIENT_IP_FROM: 'cloudflare',
    },
  });

  // nightly pg_dump into the bucket (03:00 UTC), keeping the newest 30
  const backup = service('backup', {
    source: repo,
    build: dockerfile('tools/backup/Dockerfile', ['tools/backup/**']),
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: '0 3 * * *', restartPolicyType: 'NEVER' },
    env: {
      RAILWAY_DOCKERFILE_PATH: 'tools/backup/Dockerfile',
      PG_MAJOR: '18',
      DATABASE_URL: '${{Postgres.DATABASE_URL}}',
      ...s3,
      KEEP: '30',
    },
  });

  return project('shopping-mall', {
    resources: [backup, web, Postgres, server, postgresVolume, uploads],
  });
});
