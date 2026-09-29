# Higgsfield audio

Generated on 2026-09-29 with Higgsfield's Seed Audio 1.0 (`seed_audio`), `format mp3`, `sample_rate 24000`
(64 kbps stereo). `pnpm assets` rebuilds them with ffmpeg (`tools/assets/audio.ts`): the loops become seamless
(the loop's start is crossfaded with what follows its end, and the first 0.5 s is appended so the client can
overlap passes on identical audio), and the one-shots are cut from their first sound to where they die away
and peak-normalised. The client normalizes the loops' loudness.

| File | Prompt |
|---|---|
| `ambient.mp3` | Ambient sound of a calm indoor shopping mall: soft distant crowd murmur, occasional footsteps on polished floor, gentle room reverb. No music, no clear speech. Even and steady, suitable for a seamless background loop, about 30 seconds. |
| `fountain.mp3` | Close-up sound of a small indoor stone fountain: steady water trickling and splashing into a basin. No other sounds. Even and steady for a seamless loop, about 10 seconds. |

| `chime.mp3` | A soft, pleasant two-note shop door chime, like a small brass bell ringing once as a shop door opens. Clean, warm, short, under 2 seconds, no other sounds, no music. |
| `tap.mp3` | A very short, soft, subtle user interface tap sound, a gentle wooden click, clean and modern, under half a second, no other sounds. |

The chime and tap (issue #3, about 1 credit each) come with silence around them, which the build cuts away. If
they fail to load, `client/src/audio.ts` synthesizes them.

The fountain's source has one loud splash at 6.75 s, so its loop blends only 0.6 s (a longer blend would bring
the splash into a loop that repeats every 6 s).
