# Creation-time voiceover pipeline

ElevenLabs is used **only during creation**. The delivered `dist/index.html` contains the finished MP3 audio and timing cues. It contains no ElevenLabs SDK, key, token, proxy call, streaming connection, synthesis fallback or browser speech synthesis. The build lint (`tools/build.mjs`) rejects any ElevenLabs endpoint, `xi-api-key`, `speechSynthesis`, or network API in the application code.

## Steps (PRD §8)

1. **Freeze data and scripts.** `src/content/narration.json` holds the six-chapter scripts for `en-CA` and `fr-CA`, copied verbatim from the PRD drafts. Two changes were made at the product owner's request (2026-10-06). fr-CA chapter 2 reads « Vos remboursements de capital de novembre, décembre et janvier sont reportés. » instead of the draft's calque « …sont reportés pour novembre, décembre et janvier ». For the recipient view, both languages drop the opening "In this example" / « Dans cet exemple ». The amounts are spelled out in words and were checked against the fixture: $1,600 interest, $12,000 deferred, $11,920 lower payments, $4,800 additional interest, January 31 2032, February 28 2027, $5,600.
2. **Review.** The scripts are drafts for review, not approved BDC communications. `docs/content/narration-scripts.md` is exported for reviewers.
3. **Voices.** The API key can synthesise speech but cannot list, search or audition voices (`voices_read` is not granted). Both tracks use `eleven_multilingual_v2`:
   - **en-CA:** ElevenLabs premade voice **Sarah** (`EXAVITQu4vr4xnSDxMaL`), North American English. A Canadian accent is not verified.
   - **fr-CA:** **Amélie** (`UJCi4DDncuo0VJDSIegj`), from the ElevenLabs Voice Library and selected by the product owner on 2026-10-06. Public voice-library listings describe her as a young, confident, friendly Quebec-French voice. The key cannot read voice metadata, so the ID was taken from those listings: **confirm it in the ElevenLabs Voice Library.** Changing it is a one-line edit in `narration.json` followed by a re-run.
   - Earlier fr-CA auditions of four premade voices remain in `docs/audio-auditions/` for reference.
4. **Synthesis.** `tools/generate-voiceover.mjs` calls `POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128` with `model_id: eleven_multilingual_v2` (no `language_code`; that model doesn't support it). The key comes from `ELEVENLABS_API_KEY` at build time. In this build environment an authenticating egress proxy supplied it, so no key existed on disk.
5. **Alignment → cues.** Character-level alignment is saved next to each MP3 (`narration-<locale>.alignment.json`). From it the tool builds:
   - **chapters**: one per script paragraph (`welcome, relief, difference, tradeoff, resume, next-step`), with language-specific start/end times;
   - **captions**: sentence-level, split at commas or conjunctions when long, never inside a spoken amount;
   - **marks**: the start times of key phrases. These pace the scene animations, such as revealing $1,600 when it is spoken.

   The cues also record a SHA-256 hash of script + voice + model + settings. The build fails if the audio is stale.
6. **Loudness mastering.** ElevenLabs' returned audio is kept untouched as `narration-<locale>.source.mp3`. The embedded `narration-<locale>.mp3` is normalised with a two-pass ffmpeg `loudnorm` (EBU R128) to −18 LUFS / −1.5 dBTP, but only when the source is more than 2 LU off target. This keeps both languages at a similar level, so switching language never jumps in volume. The processing does not move speech in time: pause positions match the source to within milliseconds, so the alignment stays valid. The settings used are recorded in the alignment file and the cue manifest.
7. **Embed.** `tools/build.mjs` embeds both MP3s as base64 text blocks and the trimmed cue manifests as JSON. The player decodes them into local Blob URLs only when first needed.
8. **Offline test.** `tests/acceptance.mjs` (AC-02, AC-03) plays both tracks with networking disabled and records every request during playback, replay, language switches and assistant use.

## Measured output

| Locale | Voice | Duration | Chapters | Captions | Loudness (embedded) |
|---|---|---|---|---|---|
| en-CA | Sarah (premade) | 59.4 s | 6 | 16 | −17.8 LUFS, peak −1.3 dBFS (source within tolerance, not processed) |
| fr-CA | Amélie (Voice Library) | 68.4 s | 6 | 17 | −18.5 LUFS, peak −1.9 dBFS (source −27.5 LUFS, normalised) |

## Still open (human review, AC-11)

- Audition both tracks for pronunciation of "Atelier Boréal", "Clair" and every amount and date.
- Confirm that voice ID `UJCi4DDncuo0VJDSIegj` is the intended Amélie in the ElevenLabs Voice Library.
- Speech-to-text verification could not be automated: the key lacks `speech_to_text`, and model hosts are blocked here.
