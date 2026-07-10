import { describe, expect, it } from "vitest";
import { walkFundingHistory } from "../funding-walk.js";
import { KNOWN_CEX_WALLETS } from "../stoplist.js";

const CEX_WALLET = [...KNOWN_CEX_WALLETS][0]!;

function fakeHelius(transfersByWallet: Record<string, Array<{ from: string; lamports: number }>>) {
  return {
    async getIncomingSolTransfers(wallet: string) {
      const entries = transfersByWallet[wallet] ?? [];
      return entries.map((e, i) => ({
        signature: `sig-${wallet}-${i}`,
        slot: 1,
        blockTime: 1_700_000_000,
        from: e.from,
        to: wallet,
        lamports: e.lamports,
      }));
    },
  };
}

describe("walkFundingHistory", () => {
  it("flags a fresh deployer with zero traceable funders as noTraceableHistory", async () => {
    const helius = fakeHelius({});
    const result = await walkFundingHistory(helius, async () => 0, "deployer1");
    expect(result.noTraceableHistory).toBe(true);
    expect(result.edges).toHaveLength(0);
  });

  it("walks up to 3 hops and stops at a known CEX wallet", async () => {
    const helius = fakeHelius({
      deployer1: [{ from: "funder1", lamports: 1e9 }],
      funder1: [{ from: "funder2", lamports: 1e9 }],
      funder2: [{ from: CEX_WALLET, lamports: 1e9 }],
    });

    const result = await walkFundingHistory(helius, async () => 5, "deployer1");

    expect(result.noTraceableHistory).toBe(false);
    expect(result.edges.map((e) => e.from)).toEqual(
      expect.arrayContaining(["funder1", "funder2", CEX_WALLET]),
    );
    expect(result.stoppedAt).toContainEqual({ wallet: CEX_WALLET, reason: "cex" });
  });

  it("ignores transfers below the 0.05 SOL dust threshold", async () => {
    const dustLamports = 0.01 * 1e9;
    const helius = {
      async getIncomingSolTransfers(_wallet: string, opts?: { minLamports?: number }) {
        // Mirrors real HeliusClient: caller-side dust filter is applied by the client itself.
        const minLamports = opts?.minLamports ?? 0;
        return dustLamports >= minLamports ? [{ from: "dust-sender", lamports: dustLamports }] : [];
      },
    };
    const result = await walkFundingHistory(
      helius as any,
      async () => 0,
      "deployer1",
    );
    expect(result.edges).toHaveLength(0);
    expect(result.noTraceableHistory).toBe(true);
  });
});
