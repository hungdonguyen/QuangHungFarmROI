// === Constants & Configuration ===

/** Cost of one armory star in VND */
export const STAR_COST_VND = 10507;

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
