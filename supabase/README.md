# AMPED AI studio server

One Supabase Edge Function, `produce-song`, used by the studio's "Lyrics & vocals" card:

- `mode: "lyrics"`: Claude (Opus 5.5, structured JSON output, refusal fallback on) writes original lyrics from the
  song's theme and "what's it about", one line per bar, for every section with a vocal sample.
- `mode: "song"`: ElevenLabs Music records the whole song (band and sung lyrics) from a composition plan built from
  the arrangement: genre, tempo, key, mood, guitar sound, effects, each section's length, samples and lyrics.
  The MP3 goes to the public `ai-songs` bucket, named by a hash of the plan, so a song is only paid for once.
  The game lines the recording up with its beat grid and plays it at gigs, with the lyrics on screen.

A daily cap (`DAILY_SONG_LIMIT`, default 20; `DAILY_LYRICS_LIMIT`, default 200) stops a public game from running up the bill.

## Set up

1. Create a Supabase project (e.g. "AMPED") and apply `migrations/20261026120000_ai_songs.sql`.
2. Deploy `functions/produce-song`.
3. In the dashboard: Edge Functions > Secrets, add `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`
   (optional: `ELEVENLABS_MODEL`, `DAILY_SONG_LIMIT`, `DAILY_LYRICS_LIMIT`, `ALLOWED_ORIGINS`).
4. Put the function URL and the project's anon (publishable) key in `game/js/config.js`.

Costs: each lyrics request is one Claude call (cents or less); each new recording is one ElevenLabs Music generation,
billed by ElevenLabs per your plan (commercial use needs a paid plan). Cached songs cost nothing.
