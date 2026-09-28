// The DOM overlay on top of the 3D canvas. Components read signals from ../state and send
// commands through ../commands; nothing here imports three.js.
import type { MallMeta } from '@plaza/shared/meta';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { dialog, panel } from '../state';
import { Directory } from './Directory';
import { Dock } from './Dock';
import { Fade } from './Fade';
import { Help } from './Help';
import { BrandPill, TopRight, ZoneLabel } from './Hud';
import { Minimap } from './Minimap';
import { ShopPanel } from './ShopPanel';
import { ShopPrompt } from './ShopPrompt';
import { Toasts } from './Toasts';
import './ui.css';

function App({ meta }: { meta: MallMeta }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey) return;
      if (e.key === '?') dialog.value = dialog.value === 'help' ? null : 'help';
      if (e.key === '/' && !dialog.value) {
        e.preventDefault(); // don't type the slash into the search box
        dialog.value = 'directory';
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <BrandPill />
      <ZoneLabel />
      <TopRight />
      <ShopPrompt />
      <Dock />
      <Minimap meta={meta} />
      <Toasts />
      <Fade />
      {dialog.value === 'help' && <Help />}
      {dialog.value === 'directory' && <Directory />}
      {panel.value && <ShopPanel id={panel.value} key={panel.value} />}
    </>
  );
}

export function mountUI(meta: MallMeta) {
  const root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  render(<App meta={meta} />, root);
}
