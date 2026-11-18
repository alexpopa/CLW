/**
 * Which touch layout the HUD wears. Presentation only.
 *  - "phone": a hand-held phone, either way up (an iPhone, or a foldable folded shut).
 *  - "fold":  a foldable opened out (the iPhone Duo unfolded, about 890 x 626), or anything of that size held in the hand.
 *  - null:    everything else (desktops, laptops, tablets) keeps the regular HUD untouched.
 * `?ui=phone|fold|desktop` forces one and remembers it on this device; `?ui=auto` forgets it.
 */
export type Profile = "phone" | "fold" | null;

const KEY = "lw.ui";
function forced(): string | null {
  try {
    const asked = new URLSearchParams(location.search).get("ui");
    if (asked === "auto") localStorage.removeItem(KEY);
    else if (asked === "phone" || asked === "fold" || asked === "desktop") localStorage.setItem(KEY, asked);
    return localStorage.getItem(KEY);
  } catch { return null; }
}
const choice = forced();

/** The profile for the window as it is now (a foldable changes it when opened or closed). */
export function profile(): Profile {
  if (choice === "phone" || choice === "fold") return choice;
  if (choice === "desktop") return null;
  // fingers only: a laptop with a touch screen still has a fine pointer and keeps the desktop HUD
  if (!matchMedia("(pointer:coarse)").matches || matchMedia("(any-pointer:fine)").matches) return null;
  const short = Math.min(innerWidth, innerHeight), long = Math.max(innerWidth, innerHeight);
  if (short <= 520) return "phone";
  if (short <= 760 && long <= 1000) return "fold";
  return null;
}

/** Hand-held devices get the lighter picture (fewer real lights, cheaper shadows), decided once at start. */
export const lite = profile() !== null;
