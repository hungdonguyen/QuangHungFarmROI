// === Constants & Configuration ===

/** Cost of one armory star */
export const STAR_COST_VND = 10507;
export const STAR_COST_USD = 0.40;


/** Steam Market fee percentage */
export const STEAM_FEE_PERCENT = 15;

/** 
 * Wear chances for skin drops (float distribution)
 * These are the CSROI.com standard percentages.
 * Used for computing weighted average price of a skin across all wears.
 */
export const WEAR_CHANCES = {
  'Factory New': 3.00,
  'Minimal Wear': 24.00,
  'Field-Tested': 33.00,
  'Well-Worn': 24.00,
  'Battle-Scarred': 16.00,
};

/**
 * Calculates correct wear drop chances for a skin with custom min/max float.
 * CS2 generates base float using a piecewise uniform distribution, then scales it.
 */
export function getWearChances(minFloat = 0, maxFloat = 1) {
  if (minFloat === 0 && maxFloat === 1) return WEAR_CHANCES;
  
  const ranges = [
    { name: 'Factory New', rMin: 0, rMax: 0.07, prob: 0.03, wMin: 0, wMax: 0.07 },
    { name: 'Minimal Wear', rMin: 0.07, rMax: 0.15, prob: 0.24, wMin: 0.07, wMax: 0.15 },
    { name: 'Field-Tested', rMin: 0.15, rMax: 0.38, prob: 0.33, wMin: 0.15, wMax: 0.38 },
    { name: 'Well-Worn', rMin: 0.38, rMax: 0.45, prob: 0.24, wMin: 0.38, wMax: 0.45 },
    { name: 'Battle-Scarred', rMin: 0.45, rMax: 1.00, prob: 0.16, wMin: 0.45, wMax: 1.00 }
  ];

  const result = {};
  let totalProb = 0;

  for (const range of ranges) {
    let prob = 0;
    // We want the probability that f falls into [range.wMin, range.wMax]
    for (const r of ranges) {
      const density = r.prob / (r.rMax - r.rMin);
      const overlapMin = Math.max(r.rMin, (range.wMin - minFloat) / (maxFloat - minFloat));
      const overlapMax = Math.min(r.rMax, (range.wMax - minFloat) / (maxFloat - minFloat));
      if (overlapMin < overlapMax) {
        prob += (overlapMax - overlapMin) * density;
      }
    }
    result[range.name] = prob * 100;
    totalProb += prob;
  }

  // Normalize in case floating point math misses by a tiny fraction
  if (totalProb > 0) {
    for (const key in result) {
      result[key] = (result[key] / totalProb);
    }
  }

  return result;
}

/** All supported wear states */
export const ALL_WEARS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

/** Dashboard grid layout order (row → items left to right) */
export const DASHBOARD_ORDER = [
  'ak-47-aphrodite',
  'dr-boom-charm-collection',
  'missing-link-community-charm-collection',
  'missing-link-charm-collection',
  'small-arms-charm-collection',
  'the-train-2025-collection',
  'the-overpass-2024-collection',
  'the-sport-and-field-collection',
  'fever-case',
  '2025-community-stickers',
  'sugarface-capsule',
  'elemental-craft-stickers',
];

/**
 * Standard CS2 collection rarity drop rates (CSROI.com values).
 * For a 5-tier collection:
 *   Covert:     1 in 781    → 0.128%
 *   Classified:  1 in 156.2  → 0.640%
 *   Restricted:  1 in 31.24  → 3.201%
 *   Mil-Spec:    1 in 6.25   → 16.00%
 *   Industrial:  1 in 1.25   → 80.00%
 */
export const CS2_RARITY_CHANCES = {
  5: { // 5-tier collection (Covert → Industrial)
    0: { chance: 0.128, odds: 781 },      // Rarest (Covert)
    1: { chance: 0.640, odds: 156.2 },     // Classified
    2: { chance: 3.201, odds: 31.24 },     // Restricted
    3: { chance: 16.000, odds: 6.25 },     // Mil-Spec
    4: { chance: 80.031, odds: 1.25 },     // Industrial (most common)
  },
  4: { // 4-tier collection (e.g. charm collections with 4 rarities)
    0: { chance: 0.640, odds: 156.25 },
    1: { chance: 3.200, odds: 31.25 },
    2: { chance: 16.000, odds: 6.25 },
    3: { chance: 80.160, odds: 1.25 },
  },
  3: { // 3-tier collection (charms/stickers)
    0: { chance: 3.200, odds: 31.25 },
    1: { chance: 16.000, odds: 6.25 },
    2: { chance: 80.800, odds: 1.24 },
  },
  2: { // 2-tier collection
    0: { chance: 16.000, odds: 6.25 },
    1: { chance: 84.000, odds: 1.19 },
  },
  1: { // 1-tier (special, e.g. AK-47 Aphrodite)
    0: { chance: 100, odds: 1 },
  },
};

/**
 * Get the correct rarity chances for a collection based on how many tiers it has.
 * Returns an object of { [index]: { chance, odds } } in order from rarest to most common.
 */
export function getCorrectRarityChances(numTiers) {
  return CS2_RARITY_CHANCES[numTiers] || CS2_RARITY_CHANCES[4];
}
