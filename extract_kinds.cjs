const fs = require('fs');

function extractKinds(file) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/kind\s*:\s*\d+/g);
  if (matches) {
    console.log(`In ${file}:`, [...new Set(matches)]);
  } else {
    console.log(`No kinds found in ${file}`);
  }
}

extractKinds('nest_index.js');
extractKinds('nest_chunk.js');
