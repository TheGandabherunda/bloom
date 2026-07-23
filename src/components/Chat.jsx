import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOrbit } from '../context/OrbitContext';
import GifPicker from './GifPicker';
import { getPeerColor } from '../utils/peerColors';

// Collapse consecutive GIFs from the same sender into grouped blocks
const groupMessages = (messages) => {
  const groups = [];
  for (const msg of messages) {
    const prev = groups[groups.length - 1];
    if (
      msg.type === 'gif' &&
      prev?.type === 'gif-group' &&
      prev.sender === msg.sender &&
      prev.peerId === msg.peerId
    ) {
      // Append to existing gif group
      prev.images.push(msg.image);
    } else if (msg.type === 'gif') {
      groups.push({ ...msg, type: 'gif-group', images: [msg.image] });
    } else {
      groups.push(msg);
    }
  }
  return groups;
};

const Chat = () => {
  const { chatDb, peerId, status, peerRoles } = useOrbit();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showGifs, setShowGifs] = useState(false);
  const scrollRef = useRef(null);
  const seenHashesRef = useRef(new Set());

  const addMessage = useCallback((msg) => {
    if (!msg) return;
    const key = `${msg.sender}|${msg.timestamp}|${msg.type}|${msg.text || msg.image || ''}`;
    if (seenHashesRef.current.has(key)) return;
    seenHashesRef.current.add(key);
    setMessages(prev => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!chatDb || typeof chatDb.all !== 'function') return;

    const loadMessages = async () => {
      try {
        seenHashesRef.current = new Set();
        const all = await chatDb.all();
        const msgs = (all || []).map(e => e.payload?.value || e.value).filter(Boolean);
        msgs.forEach(m => {
          const key = `${m.sender}|${m.timestamp}|${m.type}|${m.text || m.image || ''}`;
          seenHashesRef.current.add(key);
        });
        setMessages(msgs);
      } catch (e) {
        console.error('[Chat] Failed loading messages:', e);
      }
    };

    loadMessages();

    const handleUpdate = (entry) => {
      const msg = entry?.payload?.value || entry?.value || entry;
      if (msg) addMessage(msg);
    };

    if (chatDb.events?.on) {
      chatDb.events.on('update', handleUpdate);
    }
    return () => {
      if (chatDb.events?.off) {
        chatDb.events.off('update', handleUpdate);
      }
    };
  }, [chatDb, addMessage]);

  // Listen for local system messages dispatched by other contexts (e.g. PlaybackContext)
  useEffect(() => {
    const handleLocal = (e) => { if (e.detail) addMessage(e.detail); };
    window.addEventListener('bloom:chat-message', handleLocal);
    return () => window.removeEventListener('bloom:chat-message', handleLocal);
  }, [addMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sortedMessages = useMemo(() => {
    return [...messages]
      .filter(m => {
        if (m.type === 'system' && m.text) {
          const lower = m.text.toLowerCase();
          if (lower.includes('is now playing') || lower.includes('started playing') || lower.includes('started this song') || lower.includes('now playing')) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  const grouped = useMemo(() => groupMessages(sortedMessages), [sortedMessages]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !chatDb) return;

    const msg = {
      text: input,
      sender: localStorage.getItem('bloom_name') || 'Anonymous',
      timestamp: Date.now(),
      type: 'text',
      peerId
    };

    addMessage(msg);
    setInput('');

    try {
      await chatDb.add(msg);
    } catch (err) {
      console.warn('Publish warning:', err.message);
    }
  };

  const handleSendGif = async (gifUrl) => {
    if (!chatDb) return;
    const msg = {
      text: '',
      image: gifUrl,
      sender: localStorage.getItem('bloom_name') || 'Anonymous',
      timestamp: Date.now(),
      type: 'gif',
      peerId
    };

    addMessage(msg);

    try {
      await chatDb.add(msg);
    } catch (err) {
      console.warn('Publish warning:', err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!chatDb || status === 'initializing' ? (
          <div className="flex flex-col gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-4 bg-white/5 rounded-md animate-pulse" style={{ width: `${50 + i * 8}%` }} />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/20">
            <span className="material-symbols-rounded text-5xl">chat_bubble</span>
            <p className="text-xs font-bold uppercase tracking-widest">No messages yet</p>
          </div>
        ) : (
          grouped.map((msg, i) => (
            <div key={i} className="animate-in fade-in duration-200">
              {msg.type === 'system' ? (
                <div className="text-center text-white/35 text-xs py-0.5">
                  * {msg.text} *
                </div>
              ) : msg.type === 'gif-group' ? (
                <div className="text-sm flex items-start gap-1.5">
                  <div className="font-bold shrink-0 flex items-center gap-1.5 leading-[1.4]">
                    <span style={{ color: getPeerColor(msg.peerId) }}>{msg.sender}</span>
                    {peerRoles?.[msg.peerId] === 'owner' && (
                      <div className="bg-purple-600 px-2 py-0.5 rounded-full flex items-center justify-center" title="Owner">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>crown</span>
                      </div>
                    )}
                    {peerRoles?.[msg.peerId] === 'admin' && (
                      <div className="bg-yellow-500 px-2 py-0.5 rounded-full flex items-center justify-center" title="Admin">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>award_star</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`grid gap-1 ${
                      msg.images.length === 1 ? 'grid-cols-1' :
                      msg.images.length === 2 ? 'grid-cols-2' :
                      'grid-cols-3'
                    }`}
                    style={{
                      maxWidth:
                        msg.images.length === 1 ? '120px' :
                        msg.images.length === 2 ? '190px' : '270px'
                    }}
                  >
                    {msg.images.map((src, j) => (
                      <img
                        key={j}
                        src={src}
                        className="w-full aspect-square object-cover rounded-lg border border-white/10"
                        alt="gif"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm flex items-start gap-1.5">
                  <div className="font-bold shrink-0 flex items-center gap-1.5 leading-[1.4]">
                    <span style={{ color: getPeerColor(msg.peerId) }}>{msg.sender}</span>
                    {peerRoles?.[msg.peerId] === 'owner' && (
                      <div className="bg-purple-600 px-2 py-0.5 rounded-full flex items-center justify-center" title="Owner">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>crown</span>
                      </div>
                    )}
                    {peerRoles?.[msg.peerId] === 'admin' && (
                      <div className="bg-yellow-500 px-2 py-0.5 rounded-full flex items-center justify-center" title="Admin">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>award_star</span>
                      </div>
                    )}
                    <span className="text-white/50">:</span>
                  </div>
                  <span className="text-white/90 break-words min-w-0 leading-[1.4]">{msg.text}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showGifs && (
        <GifPicker
          onSelect={(url) => { handleSendGif(url); setShowGifs(false); }}
          onClose={() => setShowGifs(false)}
        />
      )}

      {/* Spacer for floating mobile player */}
      <div className="h-[80px] lg:hidden shrink-0 pointer-events-none" />

      <div className="p-4 border-t border-white/[0.06] bg-black/20">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowGifs(!showGifs)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${showGifs ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 text-white/40 hover:bg-white/15 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[26px] leading-none">gif_box</span>
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say something..."
              className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-full pl-4 pr-12 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] shadow-inner transition-colors"
            />
            <button
              type="submit"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 bg-[var(--color-primary)] hover:opacity-80 text-white rounded-full flex items-center justify-center transition-all shadow-lg"
            >
              <span className="material-symbols-rounded text-[22px] icon-fill leading-none">send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
