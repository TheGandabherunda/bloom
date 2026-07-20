export const extractDominantColors = (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    // Proxy the image URL to avoid CORS
    img.src = imageUrl;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 64; // Scale down for performance
      canvas.height = 64;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      const colors = [];
      // Sample every 4th pixel for speed
      for (let i = 0; i < data.length; i += 16) {
        // Ignore very dark or very bright colors to get vibrant dominant colors
        const r = data[i], g = data[i+1], b = data[i+2];
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        if (brightness > 30 && brightness < 220) {
           colors.push([r, g, b]);
        }
      }
      
      if (colors.length === 0) {
        colors.push([236, 72, 153]); // Fallback pink
      }

      // Simple clustering (k-means-lite) to find top 4 distinct colors
      const palettes = [];
      const used = new Set();
      
      // Sort colors by frequency roughly
      const colorCounts = {};
      colors.forEach(c => {
        // quantize slightly to group similar colors
        const key = `${Math.floor(c[0]/32)*32},${Math.floor(c[1]/32)*32},${Math.floor(c[2]/32)*32}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
      });
      
      const sortedKeys = Object.keys(colorCounts).sort((a,b) => colorCounts[b] - colorCounts[a]);
      
      for (const key of sortedKeys) {
        if (palettes.length >= 4) break;
        
        const [r,g,b] = key.split(',').map(Number);
        
        // Ensure this color is somewhat distinct from already picked palettes
        const isDistinct = palettes.every(p => {
           const dist = Math.abs(p[0]-r) + Math.abs(p[1]-g) + Math.abs(p[2]-b);
           return dist > 60; // minimum distance
        });
        
        if (isDistinct || palettes.length === 0) {
           // We add some brightness to make it look better in dark mode
           palettes.push([
             Math.min(255, r + 20), 
             Math.min(255, g + 20), 
             Math.min(255, b + 20)
           ]);
        }
      }
      
      // Fill remaining if we couldn't find 4 distinct
      while (palettes.length < 4) {
         if (palettes.length > 0) {
             const base = palettes[0];
             palettes.push([
                 Math.min(255, base[0] + Math.random()*50 - 25),
                 Math.min(255, base[1] + Math.random()*50 - 25),
                 Math.min(255, base[2] + Math.random()*50 - 25)
             ]);
         } else {
             palettes.push([236, 72, 153]); // Fallback
         }
      }
      
      resolve(palettes.map(p => `${Math.floor(p[0])} ${Math.floor(p[1])} ${Math.floor(p[2])}`));
    };
    
    img.onerror = () => {
       reject(new Error("Failed to load image for color extraction"));
    };
  });
};

// Accurate pop-color extractor using hue-bucket clustering.
// Groups pixels by hue, scores each bucket by frequency × saturation × vibrancy,
// then returns the average color of the winning cluster.
export const extractPrimaryColor = (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const SIZE = 80;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

        const BUCKETS = 36; // 10° per bucket
        // Each bucket: { sumR, sumG, sumB, sumSat, count }
        const buckets = Array.from({ length: BUCKETS }, () => ({
          sumR: 0, sumG: 0, sumB: 0, sumSat: 0, count: 0
        }));

        for (let i = 0; i < data.length; i += 4) {
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

        // Score each bucket: frequency × avg_saturation × vibrancy (not too dark/light)
        let bestScore = -1;
        let bestBucket = null;

        for (const b of buckets) {
          if (b.count < 4) continue; // ignore tiny clusters
          const avgSat = b.sumSat / b.count;
          const avgL = ((b.sumR + b.sumG + b.sumB) / b.count / 255 / 3);
          const vibrancy = 1 - Math.abs(avgL - 0.45) * 1.5; // peak around 45% lightness
          const score = b.count * avgSat * Math.max(0, vibrancy);
          if (score > bestScore) {
            bestScore = score;
            bestBucket = b;
          }
        }

        if (!bestBucket || bestBucket.count === 0) {
          return resolve('rgb(236, 72, 153)');
        }

        // Average color of winning cluster, slightly boosted for dark covers
        const n = bestBucket.count;
        const avgR = bestBucket.sumR / n;
        const avgG = bestBucket.sumG / n;
        const avgB = bestBucket.sumB / n;
        const avgLuma = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) / 255;
        const boost = avgLuma < 0.35 ? 1.4 : 1.0;

        resolve(`rgb(${Math.min(255, Math.round(avgR * boost))}, ${Math.min(255, Math.round(avgG * boost))}, ${Math.min(255, Math.round(avgB * boost))})`);
      } catch (e) {
        resolve('rgb(255, 255, 255)');
      }
    };

    img.onerror = () => resolve('rgb(255, 255, 255)');
  });
};
