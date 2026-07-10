import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string; // user id
  wallet: string;
}

export function issueJwt(payload: JwtPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}
