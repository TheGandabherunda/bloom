import React, { useState, useEffect } from 'react';
import { usePlayback } from '../context/PlaybackContext';

const defaultFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const EQStudio = ({ onClose }) => {
  const { playerRef } = usePlayback();
  const [preamp, setPreamp] = useState(0);
  const [bands, setBands] = useState(defaultFrequencies.map(f => ({ freq: f, gain: 0, q: 1.41, type: 'peaking' })));
  
  useEffect(() => {
    setBands(prev => {
      const newBands = [...prev];
      newBands[0].type = 'lowshelf';
      newBands[9].type = 'highshelf';
      return newBands;
    });
  }, []);

  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');

  const handlePreampChange = (e) => {
    const val = parseFloat(e.target.value);
    setPreamp(val);
    if (playerRef.current?.setPreamp) {
      playerRef.current.setPreamp(val);
    }
  };

  const handleBandChange = (index, val) => {
    const newBands = [...bands];
    newBands[index].gain = val;
    setBands(newBands);
    if (playerRef.current?.setEQBand) {
      playerRef.current.setEQBand(index, newBands[index].type, newBands[index].freq, newBands[index].q, val);
    }
  };

  const handleImport = () => {
    setError('');
    try {
      const lines = importText.split('\n');
      let newPreamp = 0;
      let newBands = [...bands];
      let bandIndex = 0;

      for (const line of lines) {
        if (line.toLowerCase().startsWith('preamp:')) {
          const match = line.match(/[-+]?[0-9]*\.?[0-9]+/);
          if (match) newPreamp = parseFloat(match[0]);
        } else if (line.toLowerCase().startsWith('filter')) {
          // Format: Filter 1: ON PK Fc 105 Hz Gain -2.4 dB Q 0.50
          const matchFc = line.match(/Fc\s+([0-9.]+)/i);
          const matchGain = line.match(/Gain\s+([-+]?[0-9.]+)/i);
          const matchQ = line.match(/Q\s+([0-9.]+)/i);
          const matchType = line.match(/ON\s+([A-Z]+)/i);

          if (matchFc && matchGain && matchQ && bandIndex < 10) {
            let type = 'peaking';
            if (matchType) {
                if (matchType[1] === 'LS' || matchType[1] === 'LSC') type = 'lowshelf';
                if (matchType[1] === 'HS' || matchType[1] === 'HSC') type = 'highshelf';
            }
            newBands[bandIndex] = {
              freq: parseFloat(matchFc[1]),
              gain: parseFloat(matchGain[1]),
              q: parseFloat(matchQ[1]),
              type: type
            };
            bandIndex++;
          }
        }
      }

      if (bandIndex === 0 && newPreamp === 0) {
         setError('Could not parse any filters. Make sure it is standard Parametric EQ text.');
         return;
      }

      setPreamp(newPreamp);
      setBands(newBands);
      
      if (playerRef.current) {
        playerRef.current.setPreamp(newPreamp);
        newBands.forEach((b, i) => {
          playerRef.current.setEQBand(i, b.type, b.freq, b.q, b.gain);
        });
      }
      setImportText('');
    } catch (err) {
      setError('Failed to parse text.');
    }
  };

  const handleReset = () => {
     setPreamp(0);
     const resetBands = defaultFrequencies.map((f, i) => ({ 
        freq: f, gain: 0, q: 1.41, type: i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking' 
     }));
     setBands(resetBands);
     if (playerRef.current) {
        playerRef.current.setPreamp(0);
        resetBands.forEach((b, i) => {
          playerRef.current.setEQBand(i, b.type, b.freq, b.q, b.gain);
        });
     }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="material-symbols-rounded text-3xl text-[var(--color-primary)]">tune</span>
              EQ Studio
            </h2>
            <p className="text-white/50 text-sm mt-1">Parametric EQ with AutoEq Profile Support</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col gap-8">
          
          {/* Sliders Area */}
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar items-end h-[300px]">
            {/* Preamp */}
            <div className="flex flex-col items-center gap-4 shrink-0 px-2 border-r border-white/10 pr-6 mr-2">
              <div className="text-xs text-white/50 font-mono h-4">{preamp > 0 ? '+' : ''}{preamp.toFixed(1)} dB</div>
              <div className="relative h-48 w-8 flex items-center justify-center">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 -translate-y-1/2 z-0"></div>
                <input 
                  type="range" min="-15" max="15" step="0.1" value={preamp} 
                  onChange={handlePreampChange}
                  className="w-48 h-1 -rotate-90 absolute cursor-pointer accent-[var(--color-primary)] z-10" 
                />
              </div>
              <div className="text-xs font-bold text-white tracking-widest uppercase">Preamp</div>
            </div>

            {/* EQ Bands */}
            {bands.map((band, i) => (
              <div key={i} className="flex flex-col items-center gap-4 shrink-0 px-2 flex-1 min-w-[50px]">
                <div className="text-xs text-white/50 font-mono h-4">{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}</div>
                <div className="relative h-48 w-8 flex items-center justify-center">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 -translate-y-1/2 z-0"></div>
                  <input 
                    type="range" min="-15" max="15" step="0.1" value={band.gain} 
                    onChange={(e) => handleBandChange(i, parseFloat(e.target.value))}
                    className="w-48 h-1 -rotate-90 absolute cursor-pointer accent-white z-10" 
                  />
                </div>
                <div className="text-[11px] font-bold text-white/80">{band.freq >= 1000 ? (band.freq/1000).toFixed(1) + 'k' : band.freq}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center px-4">
             <button onClick={handleReset} className="text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Reset All</button>
          </div>

          {/* Import Area */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
             <h3 className="text-lg font-bold text-white mb-2">Import AutoEq Profile</h3>
             <p className="text-sm text-white/50 mb-4">Paste the "Parametric EQ" text from autoeq.app to apply headphone correction automatically.</p>
             <textarea 
               value={importText}
               onChange={e => setImportText(e.target.value)}
               placeholder="Preamp: -5.6 dB&#10;Filter 1: ON PK Fc 20 Hz Gain 5.5 dB Q 1.41&#10;..."
               className="w-full h-32 bg-black/50 border border-white/10 rounded-xl p-4 text-xs font-mono text-white/80 focus:outline-none focus:border-[var(--color-primary)] transition-colors mb-4 resize-none"
             />
             <div className="flex items-center justify-between">
                <p className="text-red-400 text-sm font-medium">{error}</p>
                <button 
                  onClick={handleImport}
                  className="bg-[var(--color-primary)] text-black font-bold px-6 py-2.5 rounded-full hover:scale-105 active:scale-95 transition-all"
                >
                  Apply Profile
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EQStudio;
