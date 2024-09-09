import { createHash } from "crypto";

export const sha256 = (s: string) => {
  return createHash('sha256').update(s).digest('hex');
}