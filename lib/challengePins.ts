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

const HEART = `<span style="position:absolute;top:-3px;right:-5px;font-size:11px;line-height:1;filter:drop-shadow(0 0 1px #fff) drop-shadow(0 1px 1px rgba(0,0,0,.35));pointer-events:none">💗</span>`;

/** Same aesthetic as the admin draft-board pins, with optional team-favorite badge. */
export function makeChallengePinIcon(opts: {
  kind: ChallengePinKind;
  favorited?: boolean;
  selected?: boolean;
}) {
  const size = opts.selected ? 34 : opts.kind === "done" ? 26 : 28;
  const opacity = opts.kind === "done" ? "0.72" : opts.kind === "full" ? "0.85" : "1";
  const fill = FILL[opts.kind];
  const stroke = STROKE[opts.kind];
  const html = `<div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity}">${pinSvg(fill, stroke, size)}${opts.favorited ? HEART : ""}</div>`;
  return L.divIcon({
    className: "challenge-map-pin",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}
