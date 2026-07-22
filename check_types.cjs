const fs = require('fs');
const path = require('path');
const dtsPath = path.join(__dirname, 'node_modules', 'nostr-tools', 'lib', 'types', 'pool.d.ts');
if (fs.existsSync(dtsPath)) {
  console.log(fs.readFileSync(dtsPath, 'utf8'));
} else {
  console.log('Not found');
}
