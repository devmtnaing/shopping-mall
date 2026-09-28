// ─── Shopping Mall configuration ─────────────────────────────────────────────────────
// Edit this file to change the mall's name, shops, products and outfits.
// Slots (where each shop sits) come from the mall layout: w0–w5 are on the left
// as you walk in, e0–e5 on the right, "u-" prefixed slots are upstairs, and
// "flagship" is the big store at the far end. See docs/greybox.md for the map.
import { defineConfig } from '@shopping-mall/shared';

export default defineConfig({
  mall: {
    name: 'Shopping Mall',
    tagline: 'Walk the mall together.',
    currency: 'USD',
    // UI languages offered (first is the default). Strings live in client/src/i18n.
    locales: ['en', 'my'],
  },
  shops: [
    {
      id: 'lumen-coffee',
      slot: 'w0',
      name: 'Lumen Coffee',
      tagline: 'Small-batch roasts, pulled slow',
      category: 'Food & drink',
      colors: { bg: '#2b1d14', accent: '#f0b35a' },
      description: 'A neighbourhood coffee bar. Beans roasted weekly, pastries baked every morning.',
      features: ['Single-origin espresso', 'Oat and almond milk', 'Beans to take home'],
      links: [{ label: 'Visit the website', url: 'https://example.com/lumen' }],
      products: {
        adapter: 'static',
        items: [
          { id: 'house', name: 'House blend, 250 g', price: 14 },
          { id: 'ethiopia', name: 'Ethiopia Guji, 250 g', price: 18, compareAt: 21 },
          { id: 'cup', name: 'Stoneware cup', price: 24 },
        ],
      },
    },
    {
      id: 'paper-trail',
      slot: 'w1',
      name: 'Paper Trail',
      tagline: 'Books, notebooks, good pens',
      category: 'Books',
      colors: { bg: '#1c2a3a', accent: '#9fc6ff' },
      features: ['Staff picks every week', 'Stationery corner'],
      links: [{ label: 'Browse books', url: 'https://example.com/paper-trail' }],
      // products fetched from a URL (here a demo file in client/public)
      products: { adapter: 'json-url', url: '/demo/paper-trail.json' },
    },
    {
      id: 'stride',
      slot: 'w2',
      name: 'Stride',
      tagline: 'Sneakers for every day',
      category: 'Fashion',
      colors: { bg: '#141414', accent: '#c8ff3d' },
      links: [{ label: 'Shop sneakers', url: 'https://example.com/stride' }],
    },
    {
      id: 'shwe-tea',
      slot: 'w3',
      name: 'Shwe Tea House',
      tagline: 'မြန်မာ လက်ဖက်ရည်ဆိုင်',
      category: 'Food & drink',
      colors: { bg: '#3b2413', accent: '#ffcf6e' },
      description:
        'Sweet milk tea, mohinga and fresh samosas. The tagline is in Burmese to show that signs handle complex scripts.',
      links: [{ label: 'See the menu', url: 'https://example.com/shwe-tea' }],
    },
    {
      id: 'verde',
      slot: 'e0',
      name: 'Verde',
      tagline: 'Plants that are hard to kill',
      category: 'Home',
      colors: { bg: '#15301f', accent: '#8fe3a1' },
      links: [{ label: 'Find a plant', url: 'https://example.com/verde' }],
    },
    {
      id: 'pixel-arcade',
      slot: 'e1',
      name: 'Pixel Arcade',
      tagline: 'Free games · play now',
      category: 'Games',
      colors: { bg: '#23103a', accent: '#ff5fd2' },
      links: [{ label: 'Play', url: 'https://example.com/arcade' }],
    },
    {
      id: 'your-brand',
      slot: 'e2',
      name: 'Your Brand Here',
      tagline: 'This space is available',
      category: 'For rent',
      colors: { bg: '#efece6', accent: '#1b1b1b' },
      description: 'Put your brand, products or class here — every visitor walks past it.',
      links: [{ label: 'Get in touch', url: 'https://example.com/contact' }],
    },
  ],
});
