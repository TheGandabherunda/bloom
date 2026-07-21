const dominantColorsCache = new Map();
const primaryColorCache = new Map();

// Concurrency queue to prevent main-thread blocking when 50+ images load at once
const extractionQueue = [];
let isExtracting = false;

const processExtractionQueue = async () => {
  if (isExtracting || extractionQueue.length === 0) return;
  isExtracting = true;

  while (extractionQueue.length > 0) {
    const task = extractionQueue.shift();
    try {
      await task();
    } catch (e) {
      console.warn("Color extraction task failed", e);
    }
    // Yield to the main thread for 1 frame (16ms) so WebAudio and UI can breathe
    await new Promise(r => setTimeout(r, 16));
  }

  isExtracting = false;
};

export const extractDominantColors = (imageUrl) => {
  if (dominantColorsCache.has(imageUrl)) {
    return Promise.resolve(dominantColorsCache.get(imageUrl));
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const task = async () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          canvas.width = 32; // Scale down for performance (was 64)
          canvas.height = 32;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

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
            colors.push([236, 72, 153]); // Fallback pink
          }

          // Simple frequency-based clustering to find top 4 distinct colors
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
            palettes.push(palettes[0] || [236, 72, 153]);
          }

          const hexPalettes = palettes.map(c => 
            '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
          );

          dominantColorsCache.set(imageUrl, hexPalettes);
          resolve(hexPalettes);
        } catch (e) {
          resolve(['#ec4899', '#ec4899', '#ec4899', '#ec4899']);
        }
      };
      
      extractionQueue.push(task);
      processExtractionQueue();
    };

    img.onerror = () => resolve(['#ec4899', '#ec4899', '#ec4899', '#ec4899']);
  });
};

// Accurate pop-color extractor using hue-bucket clustering.
// Groups pixels by hue, scores each bucket by frequency × saturation × vibrancy,
// then returns the average color of the winning cluster.
export const extractPrimaryColor = (imageUrl) => {
  if (primaryColorCache.has(imageUrl)) {
    return Promise.resolve(primaryColorCache.get(imageUrl));
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      const task = async () => {
        try {
          const SIZE = 32; // Reduced from 80 for extreme performance boost
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

          const BUCKETS = 36; // 10° per bucket
          const buckets = Array.from({ length: BUCKETS }, () => ({
            sumR: 0, sumG: 0, sumB: 0, sumSat: 0, count: 0
          }));

          // Process every 2nd pixel (jump 8 bytes instead of 4) for extra speed
          for (let i = 0; i < data.length; i += 8) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const l = (max + min) / 2;
            const luma = r * 0.299 + g * 0.587 + b * 0.114;

            // Skip near-black, near-white, near-grey
            if (luma < 0.10 || luma > 0.93 || delta < 0.12) continue;

            // Compute hue (0–360)
            let hue = 0;
            if (delta > 0) {
              if (max === r) hue = 60 * (((g - b) / delta) % 6);
              else if (max === g) hue = 60 * ((b - r) / delta + 2);
              else hue = 60 * ((r - g) / delta + 4);
              if (hue < 0) hue += 360;
            }

            // HSL saturation
            const sat = delta / (1 - Math.abs(2 * l - 1));

            const bucket = Math.floor(hue / (360 / BUCKETS)) % BUCKETS;
            buckets[bucket].sumR += data[i];
            buckets[bucket].sumG += data[i + 1];
            buckets[bucket].sumB += data[i + 2];
            buckets[bucket].sumSat += sat;
            buckets[bucket].count += 1;
          }

          // Score each bucket: frequency × avg_saturation × vibrancy
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
            const fallback = 'rgb(236, 72, 153)';
            primaryColorCache.set(imageUrl, fallback);
            return resolve(fallback);
          }

          const n = bestBucket.count;
          const avgR = bestBucket.sumR / n;
          const avgG = bestBucket.sumG / n;
          const avgB = bestBucket.sumB / n;
          const avgLuma = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) / 255;
          const boost = avgLuma < 0.35 ? 1.4 : 1.0;

          const result = `rgb(${Math.min(255, Math.round(avgR * boost))}, ${Math.min(255, Math.round(avgG * boost))}, ${Math.min(255, Math.round(avgB * boost))})`;
          primaryColorCache.set(imageUrl, result);
          resolve(result);
        } catch (e) {
          resolve('rgb(255, 255, 255)');
        }
      };
      
      extractionQueue.push(task);
      processExtractionQueue();
    };

    img.onerror = () => resolve('rgb(255, 255, 255)');
  });
};
