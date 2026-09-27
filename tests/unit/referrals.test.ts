import { describe, expect, it } from "vitest";
import { nextReferralTier, referralPrefix, referralReward } from "@/lib/referrals";

describe("Refer Now rules", () => {
  it("uses the first 4 letters of the name, padded with X", () => {
    expect(referralPrefix("Riya Verma")).toBe("RIYA");
    expect(referralPrefix("  d'Souza  ")).toBe("DSOU");
    expect(referralPrefix("Zoë")).toBe("ZOEX");
    expect(referralPrefix("Om")).toBe("OMXX");
    expect(referralPrefix("123")).toBe("XXXX");
  });

  it("pays the highest tier reached, never the sum", () => {
    const cases: [number, number][] = [
      [0, 0],
      [4, 0],
      [5, 10_000],
      [9, 10_000],
      [10, 20_000],
      [14, 20_000],
      [15, 30_000],
      [29, 30_000],
      [30, 50_000],
      [120, 50_000],
    ];
    for (const [attended, paise] of cases) expect(referralReward(attended), `${attended} attended`).toBe(paise);
  });

  it("names the next tier until the top one", () => {
    expect(nextReferralTier(0)?.min).toBe(5);
    expect(nextReferralTier(12)?.min).toBe(15);
    expect(nextReferralTier(30)).toBeNull();
  });
});
