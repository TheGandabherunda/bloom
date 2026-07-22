import React, { useState, useEffect } from 'react';
import { getOrCreateKeys, pool, DEFAULT_RELAYS, signEvent } from '../services/nostr';
import { findBestMirror, getMirrorStatus } from '../services/musicApi';

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
    <div className="fixed inset-0 bg-black z-[200] flex flex-col justify-end items-center lg:justify-center overflow-hidden pb-8 px-4 lg:pb-0 lg:px-0">
      
      <div className="lg:hidden absolute inset-0 flex items-center justify-center pointer-events-none z-0 bloom-enter-wrap">
        <img src="./assets/Bloom.svg" className="w-[150vw] sm:w-[90vw] max-w-[800px] opacity-[0.12] rotate-slow" alt="" />
      </div>

      <div className="hidden lg:flex absolute inset-0 items-center justify-center pointer-events-none z-0 bloom-enter-wrap">
        <img src="./assets/Bloom.svg" className="w-[90vw] max-w-[800px] opacity-[0.12] rotate-slow" alt="" />
      </div>

      <div className="lg:hidden w-full max-w-md text-center z-10 mb-6">
        <h1 className="text-5xl font-bold text-white tracking-tight">Bloom</h1>
      </div>

      <div className="bg-black/90 lg:bg-black lg:backdrop-blur-none backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all pointer-events-auto relative z-10">
        <div className="text-center mb-6">
          <h1 className="hidden lg:block text-4xl font-bold text-white mb-2 tracking-tight">Bloom</h1>
          <p className="text-white/50 text-base">
            Login or Create Nostr Account
          </p>
        </div>

        <form onSubmit={handleGuestLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className="w-full h-[48px] bg-white/[0.06] border border-white/10 rounded-full px-6 text-lg text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
              placeholder="e.g., Alice"
              required={!localStorage.getItem('bloom_nip07')}
            />
          </div>

          <div className="flex flex-col gap-3 mt-4">
            
            {hasExtension ? (
              <button
                type="button"
                onClick={handleExtensionLogin}
                disabled={isOptimizing}
                className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-sm border border-purple-500/30"
              >
                Login with Nostr Extension
              </button>
            ) : (
               <div className="text-center mb-2">
                 <p className="text-white/30 text-xs">No Nostr extension detected.</p>
               </div>
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
                'Create Nostr Account'
              )}
            </button>
            
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
