// S3-compatible object storage (Railway buckets, MinIO, Cloudflare R2, AWS S3) through plain signed
// fetch requests. Configured entirely by env, so switching providers is a configuration change.
import { AwsClient } from 'aws4fetch';

export type StorageConfig = {
  endpoint: string; // e.g. https://t3.storageapi.dev or http://localhost:8333
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  /** 'virtual' puts the bucket in the hostname (Railway, AWS); 'path' in the path (SeaweedFS, MinIO). */
  urlStyle?: 'path' | 'virtual';
};

export class Storage {
  private readonly aws: AwsClient;
  private readonly base: string;

  constructor(c: StorageConfig) {
    this.aws = new AwsClient({
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      service: 's3',
      region: c.region ?? 'auto',
    });
    const endpoint = new URL(c.endpoint);
    if (c.urlStyle === 'virtual') endpoint.hostname = `${c.bucket}.${endpoint.hostname}`;
    else endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(c.bucket)}`;
    this.base = endpoint.toString().replace(/\/$/, '');
  }

  /** Storage from S3_* env vars, or null when they aren't set. */
  static fromEnv(env = process.env): Storage | null {
    const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_URL_STYLE } = env;
    if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
    return new Storage({
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      region: S3_REGION,
      urlStyle: S3_URL_STYLE === 'virtual' ? 'virtual' : 'path',
    });
  }

  private url(key: string) {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Create the bucket if it doesn't exist (fine to call on every start). */
  async ensureBucket() {
    // hosted buckets (Railway) already exist and may not allow creating them
    if ((await this.aws.fetch(this.base, { method: 'HEAD' })).ok) return;
    const res = await this.aws.fetch(this.base, { method: 'PUT' });
    // 200 created; 409 already exists / owned by you; anything else is a real problem
    if (!res.ok && res.status !== 409)
      throw new Error(`storage: can't create bucket (${res.status} ${await res.text()})`);
  }

  async put(key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
    const res = await this.aws.fetch(this.url(key), {
      method: 'PUT',
      body,
      headers: { 'Content-Type': contentType, 'Content-Length': String(body.byteLength) },
    });
    if (!res.ok) throw new Error(`storage: upload failed (${res.status} ${await res.text()})`);
  }

  /** The object as a fetch Response (stream it straight to the client). */
  get(key: string): Promise<Response> {
    return this.aws.fetch(this.url(key));
  }

  async delete(key: string) {
    const res = await this.aws.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`storage: delete failed (${res.status})`);
  }
}
