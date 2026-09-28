// The DOM overlay on top of the 3D canvas. Components read signals from ../state and send
// commands through ../commands; nothing here imports three.js.

import { useSignal } from '@preact/signals';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { chatOpen, dialog, mallMeta, panel, phase } from '../state';
import { Announcement } from './Announcement';
import { Chat } from './Chat';
import { Dock } from './Dock';
import { EmoteBar } from './EmoteBar';
import { Fade } from './Fade';
import { BrandPill, NetNotice, TopRight, ZoneLabel } from './Hud';
import { Landing } from './Landing';
import { Minimap } from './Minimap';
import { ShopPrompt } from './ShopPrompt';
import { Toasts } from './Toasts';
import './ui.css';

type Dialogs = typeof import('./dialogs');
let dialogsLoad: Promise<Dialogs> | null = null;
const loadDialogs = () => {
  dialogsLoad ??= import('./dialogs');
  return dialogsLoad;
};

function App() {
  const dialogs = useSignal<Dialogs | null>(null);
  const needDialogs = dialog.value !== null || panel.value !== null;
  useEffect(() => {
    if (phase.value !== 'playing' && !needDialogs) return;
    // fetch when first needed, or quietly once the visitor is in
    const go = () => loadDialogs().then((m) => (dialogs.value = m));
    if (needDialogs) go();
    else if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1500);
  }, [phase.value, needDialogs]);

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
      if (e.key === 'Enter' && !dialog.value && !panel.value && !chatOpen.value) {
        e.preventDefault();
        chatOpen.value = true;
        return;
      }
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
        <TopRight playing={false} />
        <Landing />
      </>
    );
  const meta = mallMeta.value;
  return (
    <>
      <BrandPill />
      <ZoneLabel />
      <NetNotice />
      <Announcement />
      <TopRight playing />
      <ShopPrompt />
      <Dock />
      {meta && <Minimap meta={meta} />}
      <Chat />
      <EmoteBar />
      <Toasts />
      <Fade />
      {dialogs.value && dialog.value === 'help' && <dialogs.value.Help />}
      {dialogs.value && dialog.value === 'directory' && <dialogs.value.Directory />}
      {dialogs.value && panel.value && <dialogs.value.ShopPanel id={panel.value} key={panel.value} />}
    </>
  );
}

export function mountUI() {
  const root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  render(<App />, root);
}
