# Creation-time voiceover pipeline

ElevenLabs is used **only during creation**. The delivered `dist/index.html` contains the finished MP3 audio and timing cues. It contains no ElevenLabs SDK, key, token, proxy call, streaming connection, synthesis fallback or browser speech synthesis. The build lint (`tools/build.mjs`) rejects any ElevenLabs endpoint, `xi-api-key`, `speechSynthesis`, or network API in the application code.

## Steps (PRD §8)

1. **Freeze data and scripts.** `src/content/narration.json` holds the six-chapter scripts for `en-CA` and `fr-CA`, copied verbatim from the PRD drafts. The amounts are spelled out in words and were checked against the fixture: $1,600 interest, $12,000 deferred, $11,920 lower payments, $4,800 additional interest, January 31 2032, February 28 2027, $5,600.
2. **Review.** The scripts are drafts for review, not approved BDC communications. `docs/content/narration-scripts.md` is exported for reviewers.
3. **Voices.** The available API key could synthesise speech but could not list, search or audition voices (`voices_read` not granted). Both tracks use the ElevenLabs premade voice **Sarah** (`EXAVITQu4vr4xnSDxMaL`) with `eleven_multilingual_v2`:
   - en-CA: North American English. A Canadian accent is **not verified**.
   - fr-CA: a multilingual voice speaking French. A **Canadian French accent is not established**. French-language support alone does not establish a Canadian accent.
   - Short fr-CA auditions of four premade voices are in `docs/audio-auditions/` for a qualified reviewer. To change voice, edit `voices` in `narration.json` and re-run the generator.
4. **Synthesis.** `tools/generate-voiceover.mjs` calls `POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128` with `model_id: eleven_multilingual_v2` (no `language_code`; that model doesn't support it). The key comes from `ELEVENLABS_API_KEY` at build time. In this build environment an authenticating egress proxy supplied it, so no key existed on disk.
5. **Alignment → cues.** Character-level alignment is saved next to each MP3 (`narration-<locale>.alignment.json`). From it the tool builds:
   - **chapters**: one per script paragraph (`welcome, relief, difference, tradeoff, resume, next-step`), with language-specific start/end times;
   - **captions**: sentence-level, split at commas or conjunctions when long, never inside a spoken amount;
   - **marks**: the start times of key phrases. These pace the scene animations, such as revealing $1,600 when it is spoken.

   The cues also record a SHA-256 hash of script + voice + model + settings. The build fails if the audio is stale.
6. **Embed.** `tools/build.mjs` embeds both MP3s as base64 text blocks and the trimmed cue manifests as JSON. The player decodes them into local Blob URLs only when first needed.
7. **Offline test.** `tests/acceptance.mjs` (AC-02, AC-03) plays both tracks with networking disabled and records every request during playback, replay, language switches and assistant use.

## Measured output

| Locale | Duration | Chapters | Captions | Loudness |
|---|---|---|---|---|
| en-CA | 60.3 s | 6 | 17 | −17.7 LUFS integrated, no silences > 0.9 s |
| fr-CA | 62.7 s | 6 | 18 | −17.7 LUFS integrated, no silences > 0.9 s |

## Still open (human review required, AC-11)

- Audition both tracks for pronunciation of "Atelier Boréal", "Clair" and every amount and date.
- A qualified Canadian French reviewer should approve the script **and** the accent. If a Canadian French voice is needed, supply its voice ID (and grant the key access to it), then regenerate.
- Speech-to-text verification could not be automated: the key lacks `speech_to_text`, and model hosts are blocked here.
