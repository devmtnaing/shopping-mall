import { parseConfig } from '@plaza/shared/config';
import { describe, expect, it } from 'vitest';
import config from '../../plaza.config';
import { renderDirectory } from '../plugins/directory';

const cfg = parseConfig(config);

describe('renderDirectory', () => {
  const html = renderDirectory(cfg);

  it('lists every shop with a link back into the 3D mall', () => {
    for (const shop of cfg.shops) {
      expect(html).toContain(`id="${shop.id}"`);
      expect(html).toContain(`href="../?s=${shop.id}"`);
    }
  });

  it('includes static products with prices, and a note for live feeds', () => {
    expect(html).toContain('House blend, 250 g');
    expect(html).toMatch(/\$14\.00/);
    expect(html).toContain('Products are listed live');
  });

  it('keeps Burmese text as-is and sets a description for search engines', () => {
    expect(html).toContain('မြန်မာ လက်ဖက်ရည်ဆိုင်');
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  });

  it('escapes HTML in shop data', () => {
    const evil = parseConfig({
      mall: { name: 'M' },
      shops: [
        {
          id: 'x',
          slot: 'w0',
          name: '<img src=x onerror=alert(1)>',
          colors: { bg: '#000000', accent: '#ffffff' },
        },
      ],
    });
    const out = renderDirectory(evil);
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('has no scripts', () => {
    expect(html).not.toMatch(/<script/i);
  });
});
