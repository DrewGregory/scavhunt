import type { NextApiResponse } from "next";

export function jsonError(
  res: NextApiResponse,
  message: string,
  status = 400,
) {
  return res.status(status).json({ error: message });
}

export function genericAuthError(res: NextApiResponse) {
  return res.status(400).json({
    error: "Unable to continue with that phone number or email.",
  });
}

export function unrecognizedAuthError(
  res: NextApiResponse,
  kind: "phone" | "email",
) {
  const what = kind === "email" ? "email" : "phone number";
  return jsonError(
    res,
    `We don't recognize that ${what}. Sign up first, or reach out to the hosts.`,
    404,
  );
}
