const dominantColorsCache = new Map();
const primaryColorCache = new Map();

let worker = null;
let msgId = 0;
const pending = new Map();

const getWorker = () => {
  if (!worker && typeof window !== 'undefined') {
    worker = new Worker(new URL('../workers/colorWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, result, error, success } = e.data;
      if (pending.has(id)) {
        const { resolve, reject } = pending.get(id);
        pending.delete(id);
        if (success) resolve(result);
        else reject(error);
      }
    };
  }
  return worker;
};

export const extractDominantColors = (imageUrl) => {
  if (dominantColorsCache.has(imageUrl)) {
    return Promise.resolve(dominantColorsCache.get(imageUrl));
  }

  return new Promise((resolve) => {
    const id = msgId++;
    pending.set(id, {
      resolve: (res) => {
        // Worker returns "R G B" strings, we need "#RRGGBB" format for the dominant palette
        const hexPalettes = res.map(c => {
            const parts = c.split(' ').map(Number);
            return '#' + parts.map(x => x.toString(16).padStart(2, '0')).join('');
        });
        dominantColorsCache.set(imageUrl, hexPalettes);
        // Also attach the raw rgb strings for CSS variables
        hexPalettes.rawRgbStrings = res;
        resolve(hexPalettes);
      },
      reject: () => {
        const fallback = ['#808080', '#808080', '#808080', '#808080'];
        fallback.rawRgbStrings = ['128 128 128', '128 128 128', '128 128 128', '128 128 128'];
        resolve(fallback);
      }
    });
    
    getWorker()?.postMessage({ id, url: imageUrl, type: 'dominant' });
  });
};

export const extractPrimaryColor = (imageUrl) => {
  if (primaryColorCache.has(imageUrl)) {
    return Promise.resolve(primaryColorCache.get(imageUrl));
  }

  return new Promise((resolve) => {
    const id = msgId++;
    pending.set(id, {
      resolve: (res) => {
        primaryColorCache.set(imageUrl, res);
        resolve(res);
      },
      reject: () => resolve('rgb(255, 255, 255)')
    });
    
    getWorker()?.postMessage({ id, url: imageUrl, type: 'primary' });
  });
};
