// The DOM overlay on top of the 3D canvas. Components read signals from ../state and send
// commands through ../commands; nothing here imports three.js.
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { dialog } from '../state';
import { Dock } from './Dock';
import { Help } from './Help';
import { BrandPill, TopRight, ZoneLabel } from './Hud';
import { ShopPrompt } from './ShopPrompt';
import { Toasts } from './Toasts';
import './ui.css';

function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey) return;
      if (e.key === '?') dialog.value = dialog.value === 'help' ? null : 'help';
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
      <Toasts />
      {dialog.value === 'help' && <Help />}
    </>
  );
}

export function mountUI() {
  const root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  render(<App />, root);
}
