// Where the game's AI studio server lives (Supabase Edge Function "produce-song", see supabase/).
// The anon key is a public key: it only lets the game call the function, which keeps the AI keys secret.
// Leave both empty to hide the AI features.
window.AMPED_CONFIG = {
  ai: { url: "", anonKey: "" }
};
