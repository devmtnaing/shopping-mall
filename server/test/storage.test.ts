import { afterEach, describe, expect, it, vi } from 'vitest';
import { Storage } from '../src/storage';

const creds = { accessKeyId: 'k', secretAccessKey: 's' };

describe('storage URLs', () => {
  afterEach(() => vi.unstubAllGlobals());
  const urlOf = async (storage: Storage) => {
    const fetch = vi.fn(async () => new Response('x'));
    vi.stubGlobal('fetch', fetch);
    await storage.get('logo/ab cd.png');
    return (fetch.mock.calls[0] as unknown as [Request])[0].url;
  };

  it('puts the bucket in the path by default (SeaweedFS, MinIO)', async () => {
    const s = new Storage({ endpoint: 'http://localhost:8333/', bucket: 'mall', ...creds });
    expect(await urlOf(s)).toBe('http://localhost:8333/mall/logo/ab%20cd.png');
  });

  it('puts the bucket in the hostname for virtual-hosted stores (Railway, AWS)', async () => {
    const s = new Storage({
      endpoint: 'https://t3.storageapi.dev',
      bucket: 'mall-x1',
      urlStyle: 'virtual',
      ...creds,
    });
    expect(await urlOf(s)).toBe('https://mall-x1.t3.storageapi.dev/logo/ab%20cd.png');
  });
});
