import nacl from "tweetnacl";
import bs58 from "bs58";

/** Verifies a wallet-adapter `signMessage` signature against the nonce message issued in POST /v1/auth/nonce. */
export function verifyWalletSignature(walletAddress: string, message: string, signatureBase58: string): boolean {
  try {
    const publicKey = bs58.decode(walletAddress);
    const signature = bs58.decode(signatureBase58);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}
