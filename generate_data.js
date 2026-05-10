import fs from 'fs';
import axios from 'axios';

/**
 * Data Generator for CS2 Armory Pass ROI Tracker
 * 
 * Sources:
 * - Skins: ByMykel collections API + skins API  
 * - Charms: ByMykel keychains API (matched by collections field)
 * - Gallery Case: ByMykel crates API (matched by contains field)
 * - Sugarface Capsule: ByMykel crates API (matched by contains field)
 * - Elemental Craft / Community 2025: Manually defined (not yet in API)
 */

// Armory groups definition with metadata
const ARMORY_GROUPS = [
  // === SKINS (from collections) ===
  { 
    slug: 'the-train-2025-collection',
    displayName: 'TRAIN 2025 COLLECTION',
    apiName: 'The Train 2025 Collection',
    type: 'skin-collection',
    stars: 4, colSpan: 4, row: 2
  },
  {
    slug: 'the-overpass-2024-collection', 
    displayName: 'OVERPASS 2024 COLLECTION',
    apiName: 'The Overpass 2024 Collection',
    type: 'skin-collection',
    stars: 4, colSpan: 4, row: 2
  },
  {
    slug: 'the-sport-and-field-collection',
    displayName: 'SPORT & FIELD COLLECTION', 
    apiName: 'The Sport & Field Collection',
    type: 'skin-collection',
    stars: 4, colSpan: 4, row: 2
  },
  // === CHARMS (from keychains) ===
  {
    slug: 'dr-boom-charm-collection',
    displayName: 'DR. BOOM CHARMS',
    apiName: 'Dr Boom Charm Collection',
    type: 'charm-collection',
    stars: 3, colSpan: 2, row: 1
  },
  {
    slug: 'missing-link-community-charm-collection',
    displayName: 'MISSING LINK COMMUNITY CHARMS',
    apiName: 'Missing Link Community Charm Collection',
    type: 'charm-collection', 
    stars: 3, colSpan: 2, row: 1
  },
  {
    slug: 'missing-link-charm-collection',
    displayName: 'MISSING LINK CHARMS',
    apiName: 'Missing Link Charm Collection',
    type: 'charm-collection',
    stars: 3, colSpan: 2, row: 1
  },
  {
    slug: 'small-arms-charm-collection',
    displayName: 'SMALL ARMS CHARMS',
    apiName: 'Small Arms Charm Collection',
    type: 'charm-collection',
    stars: 3, colSpan: 2, row: 1
  },
  // === CRATES (from crates.contains) ===
  {
    slug: 'gallery-case',
    displayName: 'GALLERY CASE',
    apiName: 'Gallery Case',
    type: 'crate',
    stars: 2, colSpan: 3, row: 3
  },
  {
    slug: 'sugarface-capsule',
    displayName: 'SUGARFACE 2 STICKERS',
    apiName: 'Sugarface Capsule',
    type: 'sticker-crate',
    stars: 1, colSpan: 3, row: 3
  },
  // === AK-47 APHRODITE (special) ===
  {
    slug: 'ak-47-aphrodite',
    displayName: 'AK-47 | APHRODITE',
    apiName: 'AK-47 | Aphrodite',
    type: 'special-skin',
    stars: 125, colSpan: 4, row: 1
  },
];

// These sticker collections are NOT in the ByMykel API yet
// We define them manually with their Steam Market hash names
const MANUAL_STICKER_GROUPS = [
  {
    slug: 'elemental-craft-stickers',
    displayName: 'ELEMENTAL CRAFT STICKERS',
    stars: 1, colSpan: 3, row: 3,
    image: '',
    costStars: 1,
    rarities: [{
      id: 'high-grade', name: 'High Grade', color: '#4b69ff', chance: 80, odds: 1.25,
      skins: [
        { id: 'st-elem-1', name: 'Sticker | Fire Swirl', marketHashNameBase: 'Sticker | Fire Swirl', image: '', wears: ['Normal'] },
        { id: 'st-elem-2', name: 'Sticker | Water Drop', marketHashNameBase: 'Sticker | Water Drop', image: '', wears: ['Normal'] },
        { id: 'st-elem-3', name: 'Sticker | Earth Root', marketHashNameBase: 'Sticker | Earth Root', image: '', wears: ['Normal'] },
      ]
    }]
  },
  {
    slug: '2025-community-stickers',
    displayName: '2025 COMMUNITY STICKERS',
    stars: 1, colSpan: 3, row: 3,
    image: '',
    costStars: 1,
    rarities: [{
      id: 'high-grade', name: 'High Grade', color: '#4b69ff', chance: 80, odds: 1.25,
      skins: [
        { id: 'st-comm-1', name: 'Sticker | Community 2025 A', marketHashNameBase: 'Sticker | Community 2025 A', image: '', wears: ['Normal'] },
        { id: 'st-comm-2', name: 'Sticker | Community 2025 B', marketHashNameBase: 'Sticker | Community 2025 B', image: '', wears: ['Normal'] },
      ]
    }]
  }
];

function getRarityChance(rarityName) {
  if (rarityName.includes('Covert') || rarityName.includes('Extraordinary')) return { chance: 0.64, odds: 156.25 };
  if (rarityName.includes('Classified') || rarityName.includes('Exotic')) return { chance: 3.2, odds: 31.25 };
  if (rarityName.includes('Restricted') || rarityName.includes('Remarkable')) return { chance: 15.98, odds: 6.25 };
  if (rarityName.includes('Mil-Spec') || rarityName.includes('High Grade') || rarityName.includes('Industrial')) return { chance: 79.92, odds: 1.25 };
  return { chance: 10, odds: 10 };
}

function groupByRarity(items, isSticker = false) {
  const rarityMap = {};
  for (const item of items) {
    const rarityName = item.rarity?.name || 'High Grade';
    const rarityId = item.rarity?.id?.toLowerCase() || 'high-grade';
    const rarityColor = item.rarity?.color || '#4b69ff';
    
    if (!rarityMap[rarityName]) {
      rarityMap[rarityName] = {
        id: rarityId,
        name: rarityName,
        color: rarityColor,
        skins: []
      };
    }

    const wears = isSticker 
      ? ['Normal'] 
      : (item.wears ? item.wears.map(w => w.name) : ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']);

    // For stickers inside crates, the market name is "Sticker | <name>"
    let marketName = item.name;
    if (isSticker && !marketName.startsWith('Sticker |')) {
      marketName = `Sticker | ${item.name}`;
    }

    rarityMap[rarityName].skins.push({
      id: item.id,
      name: item.name,
      marketHashNameBase: marketName,
      image: item.image || '',
      wears: wears,
      min_float: item.min_float !== undefined ? item.min_float : null,
      max_float: item.max_float !== undefined ? item.max_float : null
    });
  }

  return Object.values(rarityMap)
    .map(r => ({ ...r, ...getRarityChance(r.name) }))
    .sort((a, b) => b.odds - a.odds);
}

async function generate() {
  try {
    console.log('Fetching data from ByMykel API...');
    const [collectionsRes, skinsRes, keychainsRes, cratesRes] = await Promise.all([
      axios.get('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json'),
      axios.get('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json'),
      axios.get('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json'),
      axios.get('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json'),
    ]);

    const collections = collectionsRes.data;
    const skins = skinsRes.data;
    const keychains = keychainsRes.data;
    const crates = cratesRes.data;

    const finalData = [];

    for (const group of ARMORY_GROUPS) {
      let entry = null;

      if (group.type === 'skin-collection') {
        // Find skins belonging to this collection
        const collectionItems = skins.filter(s => 
          s.collections?.some(c => c.name === group.apiName)
        );
        
        console.log(`  ${group.displayName}: ${collectionItems.length} skins`);
        
        // Use the rarest skin's image as cover (looks much better than collection icon)
        const coverSkin = collectionItems.find(s => s.rarity?.name === 'Covert') 
          || collectionItems.find(s => s.rarity?.name === 'Classified')
          || collectionItems[0];
        
        entry = {
          id: group.slug,
          name: group.displayName,
          image: coverSkin?.image || '',
          costStars: group.stars,
          colSpan: group.colSpan,
          row: group.row,
          rarities: groupByRarity(collectionItems, false)
        };
      }
      else if (group.type === 'charm-collection') {
        // Find keychains belonging to this collection
        const charmItems = keychains.filter(k =>
          k.collections?.some(c => c.name === group.apiName)
        );
        
        console.log(`  ${group.displayName}: ${charmItems.length} charms`);
        
        // Use the rarest charm as cover image
        const coverCharm = charmItems.find(c => c.rarity?.name?.includes('Extraordinary') || c.rarity?.name?.includes('Exotic'))
          || charmItems.find(c => c.rarity?.name?.includes('Remarkable'))
          || charmItems[0];
        
        // Charms have "Normal" wear
        const rarities = groupByRarity(
          charmItems.map(k => ({
            ...k,
            name: k.name, // "Charm | Lil' Ava"
            wears: [{ name: 'Normal' }] // Override wears
          })),
          false
        );

        entry = {
          id: group.slug,
          name: group.displayName,
          image: coverCharm?.image || '',
          costStars: group.stars,
          colSpan: group.colSpan,
          row: group.row,
          rarities
        };
      }
      else if (group.type === 'crate') {
        // Gallery Case - items are skins with wears
        const crate = crates.find(c => c.name === group.apiName);
        if (crate && crate.contains) {
          console.log(`  ${group.displayName}: ${crate.contains.length} items`);
          
          entry = {
            id: group.slug,
            name: group.displayName,
            image: crate.image || '',
            costStars: group.stars,
            colSpan: group.colSpan,
            row: group.row,
            rarities: groupByRarity(crate.contains, false)
          };
        }
      }
      else if (group.type === 'sticker-crate') {
        // Sugarface Capsule - items are stickers (Normal only)
        const crate = crates.find(c => c.name === group.apiName);
        if (crate && crate.contains) {
          console.log(`  ${group.displayName}: ${crate.contains.length} stickers`);

          entry = {
            id: group.slug,
            name: group.displayName,
            image: crate.image || '',
            costStars: group.stars,
            colSpan: group.colSpan,
            row: group.row,
            rarities: groupByRarity(crate.contains, true)
          };
        }
      }
      else if (group.type === 'special-skin') {
        // AK-47 Aphrodite
        const ak47 = skins.find(s => s.name.includes('Aphrodite'));
        if (ak47) {
          console.log(`  ${group.displayName}: found`);
          entry = {
            id: group.slug,
            name: group.displayName,
            image: ak47.image || '',
            costStars: group.stars,
            colSpan: group.colSpan,
            row: group.row,
            rarities: [{
              id: 'covert', name: 'Covert', color: '#eb4b4b',
              chance: 100, odds: 1,
              skins: [{
                id: ak47.id,
                name: ak47.name,
                marketHashNameBase: ak47.name,
                image: ak47.image,
                wears: ak47.wears ? ak47.wears.map(w => w.name) : ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
              }]
            }]
          };
        }
      }

      if (entry) finalData.push(entry);
    }

    // Add manual sticker groups (not in API)
    for (const manual of MANUAL_STICKER_GROUPS) {
      console.log(`  ${manual.displayName}: manual (not in API)`);
      finalData.push({
        id: manual.slug,
        name: manual.displayName,
        image: manual.image,
        costStars: manual.stars,
        colSpan: manual.colSpan,
        row: manual.row,
        rarities: manual.rarities
      });
    }

    const outStr = `// Auto-generated by generate_data.js — do not edit manually
export const armoryCollections = ${JSON.stringify(finalData, null, 2)};

export const WEAR_NAMES = {
  "Factory New": "FN",
  "Minimal Wear": "MW",
  "Field-Tested": "FT",
  "Well-Worn": "WW",
  "Battle-Scarred": "BS",
  "Normal": "Normal"
};
`;
    fs.writeFileSync('src/data.js', outStr);
    console.log(`\nDone! Generated ${finalData.length} collections.`);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

generate();
