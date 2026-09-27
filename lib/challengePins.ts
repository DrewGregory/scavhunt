import L from "leaflet";

export type ChallengePinKind = "open" | "low" | "full" | "done";

export function challengePinKind(opts: {
  numWinners: number;
  acceptedCount: number;
  finishedByTeam: boolean;
}): ChallengePinKind {
  if (opts.finishedByTeam) return "done";
  const left = Math.max(0, opts.numWinners - opts.acceptedCount);
  if (left <= 0) return "full";
  if (left <= 2) return "low";
  return "open";
}

const FILL: Record<ChallengePinKind, string> = {
  open: "#38A169",
  low: "#D69E2E",
  full: "#A0AEC0",
  done: "#C05621",
};

const STROKE: Record<ChallengePinKind, string> = {
  open: "#ffffff",
  low: "#ffffff",
  full: "#ffffff",
  done: "#ECC94B",
};

function pinSvg(fill: string, stroke: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`;
}

/** Same filled heart as AiFillHeart / challenge favorite (Chakra pink.500). */
function favoriteHeartSvg(size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#D53F8C" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 0 1px #fff) drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
}

/** Same aesthetic as the admin draft-board pins, with optional team-favorite badge. */
export function makeChallengePinIcon(opts: {
  kind: ChallengePinKind;
  favorited?: boolean;
  selected?: boolean;
}) {
  const size = opts.selected ? 40 : opts.kind === "done" ? 26 : 28;
  const heartSize = Math.round(size * 0.55);
  const opacity = opts.kind === "done" ? "0.72" : opts.kind === "full" ? "0.85" : "1";
  const fill = FILL[opts.kind];
  const stroke = opts.selected ? "#1A365D" : STROKE[opts.kind];
  const ring = opts.selected
    ? `<span style="position:absolute;left:50%;bottom:2px;transform:translateX(-50%);width:${size - 4}px;height:${size - 4}px;border-radius:50%;box-shadow:0 0 0 3px rgba(49,130,206,0.95),0 0 12px rgba(49,130,206,0.55);pointer-events:none"></span>`
    : "";
  // Overlap the pin head's top-right shoulder (pin path is inset in the SVG box).
  const heart = opts.favorited
    ? `<span style="position:absolute;top:${Math.round(size * 0.02)}px;right:-${Math.round(heartSize * 0.12)}px;line-height:0;pointer-events:none;z-index:2">${favoriteHeartSvg(heartSize)}</span>`
    : "";
  const html = `<div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};filter:${opts.selected ? "drop-shadow(0 2px 4px rgba(0,0,0,.45))" : "none"}">${ring}${pinSvg(fill, stroke, size)}${heart}</div>`;
  return L.divIcon({
    className: opts.selected
      ? "challenge-map-pin challenge-map-pin--selected"
      : "challenge-map-pin",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}
