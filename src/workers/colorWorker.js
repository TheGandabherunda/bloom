const extractDominantColors = (imageData) => {
  const data = imageData.data;
  const colors = [];
  // Sample every 4th pixel for speed
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 30 && brightness < 220) {
      colors.push([r, g, b]);
    }
  }

  if (colors.length === 0) {
    colors.push([128, 128, 128]); // Fallback neutral grey
  }

  const colorCounts = {};
  colors.forEach(c => {
    const key = `${Math.floor(c[0]/32)*32},${Math.floor(c[1]/32)*32},${Math.floor(c[2]/32)*32}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
  });

  const sortedKeys = Object.keys(colorCounts).sort((a,b) => colorCounts[b] - colorCounts[a]);
  const palettes = [];

  for (const key of sortedKeys) {
    if (palettes.length >= 4) break;
    const [r,g,b] = key.split(',').map(Number);
    
    let isDistinct = true;
    for (const p of palettes) {
      const dist = Math.sqrt(Math.pow(r-p[0],2) + Math.pow(g-p[1],2) + Math.pow(b-p[2],2));
      if (dist < 40) {
        isDistinct = false;
        break;
      }
    }
    if (isDistinct) palettes.push([r,g,b]);
  }

  while (palettes.length < 4) {
    palettes.push(palettes[0] || [128, 128, 128]);
  }

  // Layout.jsx expects 'R G B' string space separated format for its CSS vars
  return palettes.map(c => `${c[0]} ${c[1]} ${c[2]}`); 
};

const extractPrimaryColor = (imageData) => {
  const data = imageData.data;
  const BUCKETS = 36;
  const buckets = Array.from({ length: BUCKETS }, () => ({
    sumR: 0, sumG: 0, sumB: 0, sumSat: 0, count: 0
  }));

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;

    if (luma < 0.10 || luma > 0.93 || delta < 0.12) continue;

    let hue = 0;
    if (delta > 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }

    const sat = delta / (1 - Math.abs(2 * l - 1));

    const bucket = Math.floor(hue / (360 / BUCKETS)) % BUCKETS;
    buckets[bucket].sumR += data[i];
    buckets[bucket].sumG += data[i + 1];
    buckets[bucket].sumB += data[i + 2];
    buckets[bucket].sumSat += sat;
    buckets[bucket].count += 1;
  }

  let bestScore = -1;
  let bestBucket = null;

  for (const b of buckets) {
    if (b.count < 4) continue;
    const avgSat = b.sumSat / b.count;
    const avgL = ((b.sumR + b.sumG + b.sumB) / b.count / 255 / 3);
    const vibrancy = 1 - Math.abs(avgL - 0.45) * 1.5;
    const score = b.count * avgSat * Math.max(0, vibrancy);
    if (score > bestScore) {
      bestScore = score;
      bestBucket = b;
    }
  }

  if (!bestBucket || bestBucket.count === 0) {
    return 'rgb(128, 128, 128)';
  }

  const n = bestBucket.count;
  const avgR = bestBucket.sumR / n;
  const avgG = bestBucket.sumG / n;
  const avgB = bestBucket.sumB / n;
  const avgLuma = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) / 255;
  const boost = avgLuma < 0.35 ? 1.4 : 1.0;

  return `rgb(${Math.min(255, Math.round(avgR * boost))}, ${Math.min(255, Math.round(avgG * boost))}, ${Math.min(255, Math.round(avgB * boost))})`;
};


self.onmessage = async (e) => {
  const { id, url, type } = e.data;
  
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
    
    // Resize down to 32x32 for extremely fast analysis
    const bitmap = await createImageBitmap(blob, { resizeWidth: 32, resizeHeight: 32 });
    
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    const imageData = ctx.getImageData(0, 0, 32, 32);

    let result;
    if (type === 'dominant') {
      result = extractDominantColors(imageData);
    } else {
      result = extractPrimaryColor(imageData);
    }

    self.postMessage({ id, result, success: true });
  } catch (error) {
    self.postMessage({ id, error: error.message, success: false });
  }
};
