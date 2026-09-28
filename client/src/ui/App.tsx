// The DOM overlay on top of the 3D canvas. Components read signals from ../state and send
// commands through ../commands; nothing here imports three.js.
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { dialog, mallMeta, panel, phase } from '../state';
import { Directory } from './Directory';
import { Dock } from './Dock';
import { Fade } from './Fade';
import { Help } from './Help';
import { BrandPill, TopRight, ZoneLabel } from './Hud';
import { Landing } from './Landing';
import { Minimap } from './Minimap';
import { ShopPanel } from './ShopPanel';
import { ShopPrompt } from './ShopPrompt';
import { Toasts } from './Toasts';
import './ui.css';

function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        phase.value !== 'playing' ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === '?') dialog.value = dialog.value === 'help' ? null : 'help';
      if (e.key === '/' && !dialog.value) {
        e.preventDefault(); // don't type the slash into the search box
        dialog.value = 'directory';
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  if (phase.value === 'landing')
    return (
      <>
        <TopRight />
        <Landing />
      </>
    );
  const meta = mallMeta.value;
  return (
    <>
      <BrandPill />
      <ZoneLabel />
      <TopRight />
      <ShopPrompt />
      <Dock />
      {meta && <Minimap meta={meta} />}
      <Toasts />
      <Fade />
      {dialog.value === 'help' && <Help />}
      {dialog.value === 'directory' && <Directory />}
      {panel.value && <ShopPanel id={panel.value} key={panel.value} />}
    </>
  );
}

export function mountUI() {
  const root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  render(<App />, root);
}
