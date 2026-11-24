// The language the player chose, read by the simulation for place names in ticker lines and by
// the interface for everything else.
export let lang = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
try {
  const saved = localStorage.getItem("port-fer-language");
  if (["en", "fr"].includes(saved)) lang = saved;
} catch {}

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem("port-fer-language", lang);
  } catch {}
}
