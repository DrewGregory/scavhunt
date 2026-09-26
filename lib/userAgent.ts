export type ParsedUserAgent = {
  platform: "iOS" | "Android" | "macOS" | "Windows" | "Linux" | "other";
  browser:
    | "Safari"
    | "Chrome"
    | "Firefox"
    | "Edge"
    | "Samsung"
    | "in-app"
    | "other";
};

/**
 * Tiny UA sniff for telemetry breakdowns — not a full browser detector.
 */
export function parseUserAgent(ua: string | undefined | null): ParsedUserAgent {
  const s = ua ?? "";

  let platform: ParsedUserAgent["platform"] = "other";
  if (/iPhone|iPad|iPod/i.test(s)) platform = "iOS";
  else if (/Android/i.test(s)) platform = "Android";
  else if (/Windows/i.test(s)) platform = "Windows";
  else if (/Mac OS X|Macintosh/i.test(s)) platform = "macOS";
  else if (/Linux/i.test(s)) platform = "Linux";

  let browser: ParsedUserAgent["browser"] = "other";
  if (
    /Instagram|FBAN|FBAV|Messenger|TikTok|ByteLocale|BytedanceWebview|musical_ly|Snapchat|LinkedInApp|LinkedIn/i.test(
      s,
    )
  ) {
    browser = "in-app";
  } else if (/Edg(?:e|A|iOS)?\//i.test(s)) {
    browser = "Edge";
  } else if (/SamsungBrowser/i.test(s)) {
    browser = "Samsung";
  } else if (/Firefox|FxiOS/i.test(s)) {
    browser = "Firefox";
  } else if (/Chrome|CriOS|Chromium/i.test(s)) {
    browser = "Chrome";
  } else if (/Safari/i.test(s)) {
    browser = "Safari";
  }

  return { platform, browser };
}
