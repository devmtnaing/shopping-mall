# Higgsfield audio

Generated on 2026-09-29 with Higgsfield's Seed Audio 1.0 (`seed_audio`), `format mp3`, `sample_rate 24000`
(64 kbps mono). `pnpm assets` trims them on MP3 frame boundaries (no re-encoding); the client crossfades
the loop point and normalizes loudness.

| File | Prompt |
|---|---|
| `ambient.mp3` | Ambient sound of a calm indoor shopping mall: soft distant crowd murmur, occasional footsteps on polished floor, gentle room reverb. No music, no clear speech. Even and steady, suitable for a seamless background loop, about 30 seconds. |
| `fountain.mp3` | Close-up sound of a small indoor stone fountain: steady water trickling and splashing into a basin. No other sounds. Even and steady for a seamless loop, about 10 seconds. |

The UI tap and the door chime are synthesized in code (`client/src/audio.ts`), so they need no files.
