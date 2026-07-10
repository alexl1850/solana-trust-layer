import { describe, expect, it } from "vitest";
import { extractCandidateAddresses } from "../ca-regex.js";

describe("extractCandidateAddresses", () => {
  it("finds a base58 CA embedded in a mention", () => {
    const text = "@trustlayer check this DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 is this safe?";
    expect(extractCandidateAddresses(text)).toContain("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
  });

  it("dedupes repeated addresses in the same tweet", () => {
    const addr = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    const text = `${addr} ${addr}`;
    expect(extractCandidateAddresses(text)).toEqual([addr]);
  });

  it("ignores plain English text with no address-shaped tokens", () => {
    expect(extractCandidateAddresses("is this a rug or not, please advise")).toEqual([]);
  });

  it("excludes base58-invalid characters (0, O, I, l)", () => {
    // 'l' and '0' are not valid base58 characters, so this shouldn't match as one 32+ char token
    const text = "0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl";
    expect(extractCandidateAddresses(text)).toEqual([]);
  });
});
