import { PublicKey } from "@solana/web3.js";
import type { HeliusClient } from "@solana-trust-layer/shared";
import type { GraduationStatus } from "@solana-trust-layer/analysers";

/**
 * Ported from the source bot's `graduation.ts`. Reads a pump.fun bonding
 * curve account directly on-chain so a brand-new launch has a price/
 * liquidity source before Birdeye has indexed it (Birdeye can lag 1-5
 * minutes on fresh launches).
 *
 * BondingCurve account layout: 8-byte discriminator, then
 * u64 virtualTokenReserves, u64 virtualSolReserves, u64 realTokenReserves,
 * u64 realSolReserves, u64 tokenTotalSupply, bool complete.
 */
export const PUMP_FUN_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const COMPLETE_FLAG_OFFSET = 8 + 8 * 5;

export interface BondingCurveState {
  status: GraduationStatus;
  /** 0-100 % progress along the curve (only when on curve) */
  progressPct: number;
  virtualSolReserves: number; // SOL
  realSolReserves: number; // SOL
  virtualTokenReserves: number; // UI units (pump.fun tokens are 6 decimals)
}

export function deriveBondingCurvePda(mint: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
    PUMP_FUN_PROGRAM_ID,
  );
  return pda;
}

const GRADUATION_SOL = 85; // pump.fun graduates around ~85 SOL in real reserves

export async function getGraduationStatus(
  helius: Pick<HeliusClient, "getAccountInfo">,
  mint: string,
): Promise<BondingCurveState> {
  const pda = deriveBondingCurvePda(mint);

  try {
    const info = await helius.getAccountInfo(pda.toBase58());
    if (!info || info.data.length < COMPLETE_FLAG_OFFSET + 1) {
      // No bonding curve account: not a pump.fun launch — treat as a graduated/pool token.
      return { status: "graduated", progressPct: 100, virtualSolReserves: 0, realSolReserves: 0, virtualTokenReserves: 0 };
    }

    const data = info.data;
    const complete = data.readUInt8(COMPLETE_FLAG_OFFSET) === 1;
    const virtualTokens = Number(data.readBigUInt64LE(8)) / 1e6;
    const virtualSol = Number(data.readBigUInt64LE(8 + 8)) / 1e9;
    const realSol = Number(data.readBigUInt64LE(8 + 24)) / 1e9;

    if (complete) {
      return { status: "graduated", progressPct: 100, virtualSolReserves: virtualSol, realSolReserves: realSol, virtualTokenReserves: virtualTokens };
    }

    const progressPct = Math.min(100, (realSol / GRADUATION_SOL) * 100);
    return { status: "bonding_curve", progressPct, virtualSolReserves: virtualSol, realSolReserves: realSol, virtualTokenReserves: virtualTokens };
  } catch {
    return { status: "unknown", progressPct: 0, virtualSolReserves: 0, realSolReserves: 0, virtualTokenReserves: 0 };
  }
}
