// AMPED: AI lyrics and AI-produced songs for the studio.
//
// POST { mode: "lyrics", ... }  Claude writes original lyrics for the song's sections from its theme.
// POST { mode: "song", ... }    ElevenLabs Music records the whole song (band and sung lyrics) from a
//                               composition plan built from the arrangement. The MP3 is stored in the
//                               public "ai-songs" bucket under a hash of the plan, so the same song is
//                               only ever paid for once.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets): ANTHROPIC_API_KEY, ELEVENLABS_API_KEY.
// Optional: ELEVENLABS_MODEL (default music_v1), DAILY_SONG_LIMIT (default 20), DAILY_LYRICS_LIMIT (default 200),
// ALLOWED_ORIGINS (comma-separated; default the GitHub Pages site and localhost).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://pos-novus.github.io,http://localhost:8000,http://localhost:8800").split(",");
const SONG_LIMIT = Number(Deno.env.get("DAILY_SONG_LIMIT") || 20);
const LYRICS_LIMIT = Number(Deno.env.get("DAILY_LYRICS_LIMIT") || 200);
const MUSIC_MODEL = Deno.env.get("ELEVENLABS_MODEL") || "music_v1";
const BUCKET = "ai-songs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const anthropic = new Anthropic();   // reads ANTHROPIC_API_KEY

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// ---------- input ----------
type Section = { name: string; type: string; bars: number; styles: string[]; lines: string[]; vocals: boolean };
type Brief = { title: string; theme: string; about: string; genre: string; bpm: number; key: string; mood: string; styles: string[]; sections: Section[] };
const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
function readBrief(b: any): Brief {
  const sections = (Array.isArray(b.sections) ? b.sections : []).slice(0, 12).map((s: any, i: number) => ({
    name: str(s.name, 30) || `Section ${i + 1}`, type: str(s.type, 20) || "Verse",
    bars: Math.max(1, Math.min(8, Math.round(Number(s.bars) || 4))),
    styles: (Array.isArray(s.styles) ? s.styles : []).slice(0, 6).map((x: unknown) => str(x, 60)).filter(Boolean),
    lines: (Array.isArray(s.lines) ? s.lines : []).slice(0, 16).map((x: unknown) => str(x, 120)).filter(Boolean),
    vocals: s.vocals !== false,
  }));
  if (!sections.length) throw new Error("The song has no sections.");
  return {
    title: str(b.title, 60) || "Untitled", theme: str(b.theme, 30), about: str(b.about, 400), genre: str(b.genre, 30) || "rock",
    bpm: Math.max(60, Math.min(230, Math.round(Number(b.bpm) || 120))), key: str(b.key, 20), mood: str(b.mood, 40),
    styles: (Array.isArray(b.styles) ? b.styles : []).slice(0, 10).map((x: unknown) => str(x, 60)).filter(Boolean), sections,
  };
}

// ---------- daily limits ----------
async function underLimit(kind: string, limit: number) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from("ai_requests").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
  if (error) throw error;
  return (count ?? 0) < limit;
}
const logRequest = (kind: string, detail: Record<string, unknown>) => db.from("ai_requests").insert({ kind, detail });

// ---------- lyrics (Claude) ----------
const LYRICS_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, lines: { type: "array", items: { type: "string" } } },
        required: ["index", "lines"], additionalProperties: false,
      },
    },
  },
  required: ["sections"], additionalProperties: false,
};
async function writeLyrics(brief: Brief) {
  const sung = brief.sections.map((s, i) => ({ index: i, name: s.name, type: s.type, lines_needed: s.bars })).filter((_, i) => brief.sections[i].vocals);
  const response = await anthropic.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: LYRICS_SCHEMA } },
    system: "You write original song lyrics for AMPED, a game about a young band. Lyrics are sung by an AI singer over the band's music, so they must scan on the beat: short, punchy, singable lines (4 to 9 syllables). One line per bar. Every chorus uses the same hook lines. Never quote or imitate existing songs or real artists. Keep it suitable for teenage players: no slurs, no graphic content, mild language at most.",
    messages: [{
      role: "user",
      content: `Write lyrics for this song.\n${JSON.stringify({ title: brief.title, theme: brief.theme, about: brief.about, genre: brief.genre, bpm: brief.bpm, mood: brief.mood, sections: sung }, null, 1)}\nReturn exactly lines_needed lines for each listed section, keyed by its index.`,
    }],
  } as any);
  if ((response as any).stop_reason === "refusal") throw new Error("The lyric writer declined this theme. Try wording it differently.");
  const text = (response.content as any[]).find((b) => b.type === "text")?.text;
  if (!text) throw new Error("No lyrics came back.");
  const out = JSON.parse(text);
  return (out.sections as { index: number; lines: string[] }[])
    .filter((s) => Number.isInteger(s.index) && s.index >= 0 && s.index < brief.sections.length)
    .map((s) => ({ index: s.index, lines: s.lines.slice(0, brief.sections[s.index].bars).map((l) => str(l, 120)) }));
}

// ---------- song (ElevenLabs Music) ----------
const MIN_MS = 3000, MAX_MS = 120000, MAX_TOTAL = 300000;
function compositionPlan(brief: Brief) {
  const msPerBar = (4 * 60000) / brief.bpm;
  // sections shorter than ElevenLabs' minimum are merged into the one before (or after)
  const merged: { name: string; ms: number; styles: string[]; lines: string[] }[] = [];
  brief.sections.forEach((s) => {
    const part = { name: s.name, ms: Math.round(s.bars * msPerBar), styles: [...s.styles, s.vocals && s.lines.length ? "sung vocals" : "instrumental"], lines: s.vocals ? s.lines : [] };
    const prev = merged[merged.length - 1];
    if (part.ms < MIN_MS && prev) { prev.ms += part.ms; prev.lines.push(...part.lines); prev.styles.push(...part.styles.slice(0, 2)); }
    else merged.push(part);
  });
  if (merged.length > 1 && merged[0].ms < MIN_MS) { const first = merged.shift()!; merged[0].ms += first.ms; merged[0].lines.unshift(...first.lines); }
  let total = 0;
  const sections = merged.map((m) => {
    const duration_ms = Math.max(MIN_MS, Math.min(MAX_MS, m.ms));
    total += duration_ms;
    return { section_name: m.name, positive_local_styles: [...new Set(m.styles)].slice(0, 8), negative_local_styles: [], duration_ms, lines: m.lines };
  });
  if (total > MAX_TOTAL) throw new Error("The song is too long for the AI (5 minutes at most).");
  return {
    positive_global_styles: [brief.genre, `${brief.bpm} bpm`, ...(brief.key ? [`key of ${brief.key}`] : []), ...(brief.mood ? [brief.mood] : []), ...brief.styles, "live band", "energetic lead vocals", "clear English lyrics"].slice(0, 16),
    negative_global_styles: ["spoken word", "lo-fi", "off-key vocals", "orchestral", "tempo changes"],
    sections,
  };
}
async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function produceSong(brief: Brief) {
  const plan = compositionPlan(brief);
  const hash = await sha256(JSON.stringify({ plan, model: MUSIC_MODEL }));
  const path = `${hash}.mp3`;
  const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const head = await fetch(publicUrl, { method: "HEAD" });
  if (head.ok) return { url: publicUrl, cached: true, plan };
  if (!(await underLimit("song", SONG_LIMIT))) return { error: "The studio has used today's AI recordings. Try again tomorrow.", status: 429 };
  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!, "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: MUSIC_MODEL, composition_plan: plan }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 500);
    console.error("elevenlabs", r.status, detail);
    return { error: r.status === 422 ? "The AI couldn't use this song plan. Try simpler lyrics." : "The AI recording failed. Try again in a minute.", status: 502 };
  }
  const audio = new Uint8Array(await r.arrayBuffer());
  const up = await db.storage.from(BUCKET).upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (up.error) throw up.error;
  await logRequest("song", { hash, title: brief.title, genre: brief.genre, bytes: audio.length });
  return { url: publicUrl, cached: false, plan };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
  try {
    const body = await req.json();
    const brief = readBrief(body);
    if (body.mode === "lyrics") {
      if (!(await underLimit("lyrics", LYRICS_LIMIT))) return json(req, { error: "Too many lyric requests today. Try again tomorrow." }, 429);
      const sections = await writeLyrics(brief);
      await logRequest("lyrics", { title: brief.title, genre: brief.genre });
      return json(req, { sections });
    }
    if (body.mode === "song") {
      const out = await produceSong(brief);
      if ("error" in out) return json(req, { error: out.error }, out.status);
      return json(req, out);
    }
    return json(req, { error: "mode must be lyrics or song" }, 400);
  } catch (e) {
    console.error(e);
    return json(req, { error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});
