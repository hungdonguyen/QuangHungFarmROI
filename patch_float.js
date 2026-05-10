import fs from 'fs';

async function patch() {
  console.log('Fetching skins from ByMykel API...');
  const res = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json');
  const apiSkins = await res.json();
  
  const dataPath = './src/data.js';
  let content = fs.readFileSync(dataPath, 'utf8');
  let matchCount = 0;
  
  const regex = /("id":\s*"([^"]+)"[\s\S]*?"wears":\s*\[[^\]]*\])/g;
  
  content = content.replace(regex, (match, p1, skinId) => {
    const apiSkin = apiSkins.find(s => s.id === skinId);
    if (apiSkin && apiSkin.min_float !== undefined && apiSkin.max_float !== undefined) {
      if (!match.includes('"min_float":')) {
        matchCount++;
        return `${match},\n            "min_float": ${apiSkin.min_float},\n            "max_float": ${apiSkin.max_float}`;
      }
    }
    return match;
  });
  
  fs.writeFileSync(dataPath, content, 'utf8');
  console.log(`Successfully patched ${matchCount} skins with min/max float!`);
}

patch().catch(console.error);
