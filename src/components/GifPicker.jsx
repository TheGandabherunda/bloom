import React, { useState, useEffect } from 'react';
import { getTenorGifs } from '../services/musicApi';

const GifPicker = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGifs(query.trim() || 'trending');
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchGifs = async (q) => {
    setLoading(true);
    try {
      const results = await getTenorGifs(q);
      setGifs(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-[160px] lg:bottom-[80px] left-4 right-4 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col z-[100] h-[350px] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex gap-2 shrink-0">
        <div className="flex-1 relative">
          <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full h-10 bg-white/[0.06] border border-white/10 rounded-full pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/40 transition-colors"
          />
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 transition-colors">
          <span className="material-symbols-rounded">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gifs.map(gif => (
              <img
                key={gif.id}
                src={gif.preview}
                onClick={() => { onSelect(gif.url); onClose(); }}
                className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity bg-white/[0.06] border border-white/[0.06]"
                alt=""
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GifPicker;
