import fs from 'fs';
import path from 'path';

const tokens = [
  { 
    name: 'giga', 
    urls: [
      'https://arweave.net/WFPLJoqYm0rR3xg1T0s0R1vK5uOyPh6BnmVQm5K3Qto',
      'https://gateway.pinata.cloud/ipfs/QmPnNXvQeWoZ5bYqXm8BVZaUeCbfmqhUqxB8FJ4hV7Lfou'
    ]
  },
  { 
    name: 'fartcoin', 
    urls: [
      'https://ipfs.io/ipfs/QmQ4u1gYNK6YT6zP1Gfngatk8F73vqzJKFjpgvCgM1C8AP',
      'https://gateway.pinata.cloud/ipfs/QmQ4u1gYNK6YT6zP1Gfngatk8F73vqzJKFjpgvCgM1C8AP'
    ]
  }
];

async function downloadImage(url, dest) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    const stats = fs.statSync(dest);
    console.log(`Downloaded ${path.basename(dest)}: ${stats.size} bytes`);
    return stats.size > 1000;
  } catch (err) {
    console.log(`Failed ${url}: ${err.message}`);
    return false;
  }
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'tokens');
  
  for (const token of tokens) {
    let success = false;
    for (const url of token.urls) {
      success = await downloadImage(url, path.join(outDir, `${token.name}.png`));
      if (success) break;
    }
    if (!success) {
      console.log(`All URLs failed for ${token.name}`);
    }
  }
}

main();
