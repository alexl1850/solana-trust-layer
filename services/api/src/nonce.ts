import { randomBytes } from "node:crypto";

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Solana Trust Layer.\n\nNonce: ${nonce}`;
}
