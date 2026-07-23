import React, { useState, useEffect } from 'react';
import AmbientLight from './AmbientLight';
import { getOrCreateKeys, pool, DEFAULT_RELAYS, signEvent } from '../services/nostr';
import { findBestMirror } from '../services/musicApi';

const Login = ({ onComplete }) => {
  const [name, setName] = useState(localStorage.getItem('bloom_name') || '');
  const [isOptimizing, setIsOptimizing] = useState(true);
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      if (window.nostr) {
        setHasExtension(true);
      }
    }, 500);

    const optimize = async () => {
      await findBestMirror(true);
      setIsOptimizing(false);
    };
    optimize();
  }, []);

  const publishProfile = async (displayName, pk, sk) => {
    try {
      const eventTemplate = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({ name: displayName, display_name: displayName })
      };
      
      let signedEvent;
      if (sk === 'extension') {
        signedEvent = await window.nostr.signEvent(eventTemplate);
      } else {
        signedEvent = signEvent(eventTemplate, sk);
      }
      
      pool.publish(DEFAULT_RELAYS, signedEvent);
    } catch (err) {
      console.warn("Failed to publish profile:", err);
    }
  };

  const handleExtensionLogin = async (e) => {
    e.preventDefault();
    if (!window.nostr || isOptimizing) return;

    try {
      const pubkey = await window.nostr.getPublicKey();
      localStorage.setItem('bloom_nip07', 'true');
      proceedToApp(name || 'Nostr User', pubkey, 'extension');
    } catch (err) {
      console.error("Extension login failed", err);
    }
  };

  const handleGuestLogin = (e) => {
    e.preventDefault();
    if (!name || isOptimizing) return;

    localStorage.removeItem('bloom_nip07');
    const { sk, pk } = getOrCreateKeys();
    proceedToApp(name, pk, sk);
  };

  const proceedToApp = (displayName, pk, sk) => {
    localStorage.setItem('bloom_name', displayName);
    publishProfile(displayName, pk, sk);
    onComplete({ displayName, nostrPk: pk, nostrSk: sk });
  };
  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col justify-end md:justify-center items-center overflow-hidden px-4 md:px-0 pb-24 md:pb-0 animate-fade-in">
      
      {/* LED Edge Light Effect */}
      <AmbientLight />

      {/* Top Logo Title */}
      <div className="absolute top-12 left-0 right-0 text-center z-10 pointer-events-none px-4">
        <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Bloom</h1>
      </div>

      <div className="w-full max-w-sm transform transition-all pointer-events-auto relative z-10 p-4 lg:p-0 mx-auto">
        <div className="mb-8 w-full text-center">
          <h2 className="text-[2.8rem] text-white/90 font-['Gloock'] tracking-tight leading-none">
            Enter the space.<br />
            Feel the sound.
          </h2>
        </div>

        <form onSubmit={handleGuestLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className="w-full h-[48px] bg-white/[0.06] rounded-full px-6 text-lg text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
              placeholder="e.g., Alice"
              required={!localStorage.getItem('bloom_nip07')}
            />
          </div>

          <div className="flex flex-col gap-3 mt-4">
            {hasExtension && (
              <button
                type="button"
                onClick={handleExtensionLogin}
                disabled={isOptimizing}
                className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-sm border border-purple-500/30"
              >
                Login with Nostr Extension
              </button>
            )}

            <button
              type="submit"
              disabled={isOptimizing}
              className="w-full bg-white hover:bg-white/90 disabled:bg-white/10 disabled:text-white/20 text-black font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-lg relative overflow-hidden"
            >
              {isOptimizing ? (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                  <span className="text-sm font-bold uppercase tracking-widest">Connecting...</span>
                </div>
              ) : (
                'Join Bloom'
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center pointer-events-none z-0 px-4">
        <div className="w-full overflow-hidden leading-none opacity-10 flex justify-center items-end">
          <svg viewBox="0 0 100 28" className="w-full h-auto">
            <text x="50%" y="27" textAnchor="middle" className="font-['Gloock'] fill-white tracking-tight" fontSize="32">
              Bloom
            </text>
          </svg>
        </div>
        <p className="text-white/30 text-xs text-center mt-1">
          Bloom uses the decentralized Nostr network for secure, peer-to-peer connection handling.
        </p>
      </div>
    </div>
  );
};

export default Login;
