/* eslint-disable no-empty */
export const getActiveRoomId = (roomId) => {
  if (roomId) return roomId;
  if (typeof window !== 'undefined' && window.location.hash) {
    const raw = window.location.hash.replace(/^#/, '').split('?')[0];
    if (raw) return raw;
  }
  return '';
};

export const getSavedDeletedRecs = (roomId) => {
  const ids = new Set();
  const rId = getActiveRoomId(roomId);
  if (rId && typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem(`bloom_deleted_recs_${rId}`);
      if (saved) {
        JSON.parse(saved).forEach((id) => ids.add(id));
      }
    } catch (e) {}
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const globalSaved = localStorage.getItem('bloom_deleted_recs_global');
      if (globalSaved) {
        JSON.parse(globalSaved).forEach((id) => ids.add(id));
      }
    } catch (e) {}
  }
  return ids;
};

export const saveDeletedRec = (recId, roomId) => {
  if (!recId || typeof window === 'undefined' || !window.localStorage) return;
  const rId = getActiveRoomId(roomId);
  if (rId) {
    try {
      const saved = localStorage.getItem(`bloom_deleted_recs_${rId}`);
      const set = new Set(saved ? JSON.parse(saved) : []);
      set.add(recId);
      localStorage.setItem(`bloom_deleted_recs_${rId}`, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }
  try {
    const globalSaved = localStorage.getItem('bloom_deleted_recs_global');
    const set = new Set(globalSaved ? JSON.parse(globalSaved) : []);
    set.add(recId);
    localStorage.setItem('bloom_deleted_recs_global', JSON.stringify(Array.from(set)));
  } catch (e) {}
};
