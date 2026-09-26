import { onINP, onLCP, type Metric } from "web-vitals";
import { track } from "./telemetry";

let started = false;

/** Reports LCP and INP for this page load. Only the first caller's page is used. */
export function reportWebVitals(page: string) {
  if (started || typeof window === "undefined") return;
  started = true;
  const report = (m: Metric) =>
    track("web_vital", {
      durationMs: Math.round(m.value),
      meta: {
        name: m.name,
        page,
        rating: m.rating,
        navigationType: m.navigationType,
      },
    });
  onLCP(report);
  onINP(report);
}
