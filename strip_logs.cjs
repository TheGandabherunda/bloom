const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let totalModified = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Match any line that has console.log/info/debug and remove the line entirely
  const regex = /^[ \t]*console\.(log|info|debug)\(.*?\);?[ \t]*\r?\n?/gm;
  const newContent = content.replace(regex, '');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    totalModified++;
    console.log(`Cleaned: ${file}`);
  }
});

console.log(`Finished cleaning ${totalModified} files.`);
