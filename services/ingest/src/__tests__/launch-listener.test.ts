import { describe, expect, it } from "vitest";
import { pickNewMint } from "../launch-listener.js";

const WSOL = "So11111111111111111111111111111111111111112";

describe("pickNewMint", () => {
  it("pump.fun: picks the mint that only appears post-tx (genuinely new), excluding wSOL", () => {
    const mint = pickNewMint("pumpfun", [WSOL], [WSOL, "NEW_MEME_MINT"]);
    expect(mint).toBe("NEW_MEME_MINT");
  });

  it("pumpswap: picks the mint present in both pre and post balances (the LP-deposited token, not the new LP mint)", () => {
    const mint = pickNewMint(
      "pumpswap",
      [WSOL, "EXISTING_MEME_MINT"],
      [WSOL, "EXISTING_MEME_MINT", "BRAND_NEW_LP_MINT"],
    );
    expect(mint).toBe("EXISTING_MEME_MINT");
  });

  it("raydium: same pre/post-intersection rule as pumpswap", () => {
    const mint = pickNewMint("raydium", ["EXISTING_MEME_MINT"], ["EXISTING_MEME_MINT", "NEW_LP_MINT"]);
    expect(mint).toBe("EXISTING_MEME_MINT");
  });

  it("returns undefined when no candidate mint is found", () => {
    expect(pickNewMint("pumpfun", [WSOL], [WSOL])).toBeUndefined();
    expect(pickNewMint("pumpswap", [], ["NEW_LP_MINT"])).toBeUndefined();
  });
});
