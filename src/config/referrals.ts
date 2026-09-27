/**
 * "Refer Now" reward tiers, as supplied by the organisers (27 Sep 2026).
 * A referral counts once the friend is checked in at the party. The reward is
 * the highest tier reached (tiers don't add up) and is paid by the organisers
 * at the party, in cash or UPI. Amounts are integer paise.
 */
export const REFERRAL_TIERS = [
  { min: 5, rewardPaise: 10_000 },
  { min: 10, rewardPaise: 20_000 },
  { min: 15, rewardPaise: 30_000 },
  { min: 30, rewardPaise: 50_000 },
] as const;

export type ReferralTier = (typeof REFERRAL_TIERS)[number];
