import crypto from "crypto";

export function getHash(filePath: string): string {
  return crypto.createHash("sha256").update(filePath).digest("hex");
}
