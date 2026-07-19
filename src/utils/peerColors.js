// 12 perceptually distinct, vibrant colors — maximally spread across the color wheel
const PALETTE = [
  'hsl(0, 80%, 65%)',    // red
  'hsl(210, 80%, 65%)',  // blue
  'hsl(120, 60%, 55%)',  // green
  'hsl(35, 90%, 60%)',   // orange
  'hsl(280, 70%, 70%)',  // purple
  'hsl(170, 70%, 52%)',  // teal
  'hsl(330, 80%, 68%)',  // pink
  'hsl(55, 85%, 55%)',   // yellow-green
  'hsl(195, 85%, 60%)',  // cyan
  'hsl(15, 80%, 62%)',   // coral
  'hsl(245, 75%, 72%)',  // indigo
  'hsl(145, 65%, 52%)',  // mint
];

const hashString = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // force 32-bit int
  }
  return Math.abs(hash);
};

/**
 * Returns a consistent, perceptually distinct color for a peer.
 * @param {string} peerId
 * @returns {string} hsl() color string
 */
export const getPeerColor = (peerId) => {
  if (!peerId) return 'hsl(0, 0%, 100%)';
  const idx = hashString(peerId) % PALETTE.length;
  return PALETTE[idx];
};
