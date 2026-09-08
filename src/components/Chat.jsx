import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { usePlayback } from '../context/PlaybackContext';
import GifPicker from './GifPicker';
import RecommendSongModal from './RecommendSongModal';
import { getPeerColor } from '../utils/peerColors';
import { getSavedDeletedRecs, saveDeletedRec } from '../utils/chatStorage';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Collapse consecutive GIFs from the same sender into grouped blocks
const groupMessages = (messages) => {
  const groups = [];
  for (const msg of messages) {
    if (
      !msg ||
      msg.type === 'recommendation_vote' ||
      msg.type === 'recommendation_status' ||
      msg.type === 'recommendation_delete'
    ) {
      continue;
    }
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
  const { chatDb, peerId, status, peerRoles, isHost, peers, roomId } = useOrbit();
  const { addToQueue } = usePlayback();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showGifs, setShowGifs] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const scrollRef = useRef(null);
  const seenHashesRef = useRef(new Set());
  const resolvedRecsRef = useRef(new Set());
  const [deletedRecIds, setDeletedRecIds] = useState(() => getSavedDeletedRecs(roomId));
  const deletedRecsRef = useRef(getSavedDeletedRecs(roomId));

  useEffect(() => {
    const saved = getSavedDeletedRecs(roomId);
    deletedRecsRef.current = saved;
    setDeletedRecIds(saved);
  }, [roomId]);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('bloom_chat_sound') !== 'false';
  });
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('bloom_chat_sound', soundEnabled);
  }, [soundEnabled]);

  const addMessage = useCallback((msg, isNewRemote = false) => {
    if (!msg) return;

    // Discard deleted recommendations
    if (
      msg.type === 'recommendation' &&
      (deletedRecsRef.current.has(msg.id) || getSavedDeletedRecs(roomId).has(msg.id))
    ) {
      return;
    }

    if (msg.type === 'recommendation_delete') {
      if (msg.recommendationId) {
        saveDeletedRec(msg.recommendationId, roomId);
        deletedRecsRef.current.add(msg.recommendationId);
        setDeletedRecIds((prev) => new Set([...prev, msg.recommendationId]));
        setMessages((prev) =>
          prev.filter((m) => m.id !== msg.recommendationId && m.recommendationId !== msg.recommendationId)
        );
      }
      return;
    }

    if (msg.type === 'recommendation_vote') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msg.recommendationId) {
            const votes = { ...(m.votes || {}) };
            if (msg.vote === null) delete votes[msg.peerId];
            else votes[msg.peerId] = msg.vote;
            return { ...m, votes };
          }
          return m;
        })
      );
      return;
    }

    if (msg.type === 'recommendation_status') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msg.recommendationId) {
            return { ...m, status: msg.status };
          }
          return m;
        })
      );
      return;
    }

    if (msg.type === 'recommendation') {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = { ...msg };
          return copy;
        }
        return [...prev, msg];
      });

      if (isNewRemote && soundEnabledRef.current) {
        const audio = new Audio('/assets/noti.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      }
      return;
    }

    // Ignore non-displayable or corrupt messages
    if (msg.type === 'gif' || msg.type === 'gif-group') {
      if (!msg.image && (!msg.images || msg.images.length === 0)) return;
    } else if (msg.type === 'system') {
      if (!msg.text || typeof msg.text !== 'string' || !msg.text.trim()) return;
    } else if (msg.type === 'text' || (!msg.type && msg.text)) {
      if (!msg.text || typeof msg.text !== 'string' || !msg.text.trim()) return;
    } else {
      return;
    }

    const key = `${msg.sender}|${msg.timestamp}|${msg.type}|${msg.text || msg.image || ''}`;
    if (seenHashesRef.current.has(key)) return;
    seenHashesRef.current.add(key);
    setMessages((prev) => [...prev, msg]);

    if (isNewRemote && msg.type !== 'system' && soundEnabledRef.current) {
      // Host shouldn't hear the notification sound
      if (peerRoles && peerId && peerRoles[peerId] === 'owner') return;

      const audio = new Audio('/assets/noti.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }
  }, [peerId, peerRoles, roomId]);

  useEffect(() => {
    if (!chatDb || typeof chatDb.all !== 'function') return;

    const loadMessages = async () => {
      try {
        seenHashesRef.current = new Set();
        const all = await chatDb.all();
        const rawMsgs = (all || []).map((e) => e.payload?.value || e.value).filter(Boolean);

        // Load saved deleted recommendations
        const deletedIds = getSavedDeletedRecs(roomId);

        // Collect deletions from message log
        rawMsgs.forEach((m) => {
          if (m.type === 'recommendation_delete' && m.recommendationId) {
            deletedIds.add(m.recommendationId);
            saveDeletedRec(m.recommendationId, roomId);
          }
        });
        deletedRecsRef.current = deletedIds;
        setDeletedRecIds(new Set(deletedIds));

        // Group & process recommendations
        const recMap = new Map();
        rawMsgs.forEach((m) => {
          if (m.type === 'recommendation' && !deletedIds.has(m.id)) {
            recMap.set(m.id, { ...m, votes: { ...(m.votes || {}) } });
          }
        });

        // Apply votes and status
        rawMsgs.forEach((m) => {
          if (m.type === 'recommendation_vote' && recMap.has(m.recommendationId)) {
            const rec = recMap.get(m.recommendationId);
            if (m.vote === null) delete rec.votes[m.peerId];
            else rec.votes[m.peerId] = m.vote;
          } else if (m.type === 'recommendation_status' && recMap.has(m.recommendationId)) {
            const rec = recMap.get(m.recommendationId);
            rec.status = m.status;
          }
        });

        // Assemble clean, displayable message list
        const cleanMsgs = [];
        rawMsgs.forEach((m) => {
          if (m.type === 'recommendation') {
            if (!deletedIds.has(m.id) && recMap.has(m.id)) {
              cleanMsgs.push(recMap.get(m.id));
              recMap.delete(m.id);
            }
          } else if (m.type === 'system' && m.text && typeof m.text === 'string' && m.text.trim()) {
            cleanMsgs.push(m);
          } else if (m.type === 'gif' || m.type === 'gif-group') {
            if (m.image || (m.images && m.images.length > 0)) {
              cleanMsgs.push(m);
            }
          } else if ((m.type === 'text' || !m.type) && m.text && typeof m.text === 'string' && m.text.trim()) {
            cleanMsgs.push(m);
          }
          // Internal control messages are excluded from display
        });

        cleanMsgs.forEach((m) => {
          const key = `${m.sender}|${m.timestamp}|${m.type}|${m.text || m.image || ''}`;
          seenHashesRef.current.add(key);
        });

        setMessages(cleanMsgs);
      } catch (e) {
        console.error('[Chat] Failed loading messages:', e);
      }
    };

    loadMessages();

    const handleUpdate = (entry) => {
      const msg = entry?.payload?.value || entry?.value || entry;
      if (msg) addMessage(msg, msg.peerId !== peerId);
    };

    if (chatDb.events?.on) {
      chatDb.events.on('update', handleUpdate);
    }
    return () => {
      if (chatDb.events?.off) {
        chatDb.events.off('update', handleUpdate);
      }
    };
  }, [chatDb, addMessage, peerId, roomId]);

  // Listen for local system messages dispatched by other contexts (e.g. PlaybackContext)
  useEffect(() => {
    const handleLocal = (e) => {
      if (e.detail) addMessage(e.detail, false);
    };
    window.addEventListener('bloom:chat-message', handleLocal);
    return () => window.removeEventListener('bloom:chat-message', handleLocal);
  }, [addMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sortedMessages = useMemo(() => {
    const deletedSet = new Set([...deletedRecIds, ...deletedRecsRef.current]);
    return [...messages]
      .filter((m) => {
        if (!m) return false;
        // Strip out internal sync types
        if (
          m.type === 'recommendation_vote' ||
          m.type === 'recommendation_status' ||
          m.type === 'recommendation_delete'
        ) {
          return false;
        }
        // Strip out deleted recommendations
        if (m.type === 'recommendation') {
          if (!m.id || deletedSet.has(m.id)) return false;
          return true;
        }
        // Validate system messages
        if (m.type === 'system') {
          if (!m.text || typeof m.text !== 'string' || !m.text.trim()) return false;
          const lower = m.text.toLowerCase();
          if (
            lower.includes('is now playing') ||
            lower.includes('started playing') ||
            lower.includes('started this song') ||
            lower.includes('now playing')
          ) {
            return false;
          }
          return true;
        }
        // Validate GIFs
        if (m.type === 'gif' || m.type === 'gif-group') {
          return Boolean(m.image || (m.images && m.images.length > 0));
        }
        // Validate standard text messages - MUST have actual non-whitespace text
        if (m.type === 'text' || (!m.type && m.text)) {
          return Boolean(m.text && typeof m.text === 'string' && m.text.trim());
        }
        return false;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, deletedRecIds]);

  const grouped = useMemo(() => groupMessages(sortedMessages), [sortedMessages]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !chatDb) return;

    const msg = {
      text: input,
      sender: localStorage.getItem('bloom_name') || 'Anonymous',
      timestamp: Date.now(),
      type: 'text',
      peerId,
    };

    addMessage(msg, false);
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
      peerId,
    };

    addMessage(msg, false);

    try {
      await chatDb.add(msg);
    } catch (err) {
      console.warn('Publish warning:', err.message);
    }
  };

  const handleSelectRecommend = async (track) => {
    if (!chatDb || !track) return;
    const recId = `rec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const myName = localStorage.getItem('bloom_name') || 'Anonymous';
    const msg = {
      id: recId,
      type: 'recommendation',
      sender: myName,
      peerId,
      timestamp: Date.now(),
      track: {
        id: track.id,
        title: track.title,
        author: track.author,
        thumbnail: track.thumbnail,
        duration: track.duration,
        downloadUrl: track.downloadUrl,
      },
      votes: {},
      status: 'pending',
    };

    addMessage(msg, false);
    setShowRecommend(false);

    try {
      await chatDb.add(msg);
    } catch (err) {
      console.warn('Failed to publish recommendation:', err);
    }
  };

  const handleVote = async (recId, voteType) => {
    if (!chatDb) return;
    const target = messages.find((m) => m.id === recId);
    if (!target || target.status !== 'pending') return;

    const isHostUser = Boolean(isHost || peerRoles?.[peerId] === 'owner');
    const isOwnerOrAdmin = Boolean(isHostUser || peerRoles?.[peerId] === 'admin');

    // Host or Owner/Admin has absolute decision authority
    if (isOwnerOrAdmin) {
      if (voteType === 'agree') {
        resolvedRecsRef.current.add(recId);
        if (addToQueue && target.track) {
          addToQueue(target.track);
        }

        const updatedVotes = { ...(target.votes || {}), [peerId]: 'agree' };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === recId ? { ...m, votes: updatedVotes, status: 'added' } : m
          )
        );

        try {
          await chatDb.add({
            type: 'recommendation_status',
            recommendationId: recId,
            status: 'added',
            timestamp: Date.now(),
          });
          await chatDb.add({
            type: 'recommendation_vote',
            recommendationId: recId,
            peerId,
            vote: 'agree',
            sender: localStorage.getItem('bloom_name') || 'Host',
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn('Failed to publish approval:', err);
        }

        window.dispatchEvent(
          new CustomEvent('bloom:chat-message', {
            detail: {
              text: `"${target.track?.title}" was approved by host and added to queue!`,
              type: 'system',
              sender: 'System',
              timestamp: Date.now(),
            },
          })
        );
        return;
      } else if (voteType === 'disagree') {
        resolvedRecsRef.current.add(recId);

        const updatedVotes = { ...(target.votes || {}), [peerId]: 'disagree' };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === recId ? { ...m, votes: updatedVotes, status: 'rejected' } : m
          )
        );

        try {
          await chatDb.add({
            type: 'recommendation_status',
            recommendationId: recId,
            status: 'rejected',
            timestamp: Date.now(),
          });
          await chatDb.add({
            type: 'recommendation_vote',
            recommendationId: recId,
            peerId,
            vote: 'disagree',
            sender: localStorage.getItem('bloom_name') || 'Host',
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn('Failed to publish veto:', err);
        }

        window.dispatchEvent(
          new CustomEvent('bloom:chat-message', {
            detail: {
              text: `Recommendation for "${target.track?.title}" was declined by host.`,
              type: 'system',
              sender: 'System',
              timestamp: Date.now(),
            },
          })
        );
        return;
      }
    }

    // Normal peer voting (peers can change or toggle their vote)
    const currentVote = target.votes?.[peerId];
    const newVote = currentVote === voteType ? null : voteType;

    // Optimistic local update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === recId) {
          const updatedVotes = { ...(m.votes || {}) };
          if (newVote === null) delete updatedVotes[peerId];
          else updatedVotes[peerId] = newVote;
          return { ...m, votes: updatedVotes };
        }
        return m;
      })
    );

    try {
      await chatDb.add({
        type: 'recommendation_vote',
        recommendationId: recId,
        peerId,
        vote: newVote,
        sender: localStorage.getItem('bloom_name') || 'Anonymous',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to publish vote:', err);
    }
  };

  const handleDeleteRecommendation = async (recId) => {
    if (!chatDb) return;
    const target = messages.find((m) => m.id === recId);
    if (!target) return;

    const isHostUser = Boolean(isHost || peerRoles?.[peerId] === 'owner');
    const isOwnerOrAdmin = Boolean(isHostUser || peerRoles?.[peerId] === 'admin');
    const isSender = target.peerId === peerId;

    if (!isSender && !isOwnerOrAdmin) return;

    // Track as deleted persistently
    saveDeletedRec(recId, roomId);
    deletedRecsRef.current.add(recId);
    setDeletedRecIds((prev) => new Set([...prev, recId]));

    // Optimistic local removal
    setMessages((prev) => prev.filter((m) => m.id !== recId && m.recommendationId !== recId));
    resolvedRecsRef.current.add(recId);

    try {
      await chatDb.add({
        type: 'recommendation_delete',
        recommendationId: recId,
        deletedBy: peerId,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to publish recommendation deletion:', err);
    }
  };

  // Host evaluates recommendation consensus & owner decisions
  useEffect(() => {
    const isHostUser = Boolean(isHost || peerRoles?.[peerId] === 'owner');
    if (!isHostUser || !addToQueue || !chatDb) return;

    messages.forEach((msg) => {
      if (
        msg.type === 'recommendation' &&
        msg.status === 'pending' &&
        !resolvedRecsRef.current.has(msg.id)
      ) {
        const votes = msg.votes || {};

        // 1. Check Owner / Admin vote
        let ownerApproved = false;
        let ownerVetoed = false;

        Object.keys(votes).forEach((voterId) => {
          const role = (voterId === peerId && isHostUser) ? 'owner' : (peerRoles?.[voterId] || 'peer');
          if (role === 'owner' || role === 'admin') {
            if (votes[voterId] === 'agree') ownerApproved = true;
            if (votes[voterId] === 'disagree') ownerVetoed = true;
          }
        });

        if (ownerVetoed) {
          resolvedRecsRef.current.add(msg.id);
          chatDb.add({
            type: 'recommendation_status',
            recommendationId: msg.id,
            status: 'rejected',
            timestamp: Date.now(),
          });
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, status: 'rejected' } : m))
          );
          window.dispatchEvent(
            new CustomEvent('bloom:chat-message', {
              detail: {
                text: `Recommendation for "${msg.track?.title}" was declined by host.`,
                type: 'system',
                sender: 'System',
                timestamp: Date.now(),
              },
            })
          );
          return;
        }

        if (ownerApproved) {
          resolvedRecsRef.current.add(msg.id);
          addToQueue(msg.track);
          chatDb.add({
            type: 'recommendation_status',
            recommendationId: msg.id,
            status: 'added',
            timestamp: Date.now(),
          });
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, status: 'added' } : m))
          );
          window.dispatchEvent(
            new CustomEvent('bloom:chat-message', {
              detail: {
                text: `"${msg.track?.title}" was approved by host and added to queue!`,
                type: 'system',
                sender: 'System',
                timestamp: Date.now(),
              },
            })
          );
          return;
        }

        // 2. Check 50% party agreement
        const activePeers = peers && peers.length > 0 ? peers : (peerId ? [peerId] : []);
        if (activePeers.length > 0) {
          const totalPeers = activePeers.length;
          const agreeCount = Object.keys(votes).filter(
            (voterId) => votes[voterId] === 'agree'
          ).length;

          if (agreeCount / totalPeers >= 0.5) {
            resolvedRecsRef.current.add(msg.id);
            addToQueue(msg.track);
            chatDb.add({
              type: 'recommendation_status',
              recommendationId: msg.id,
              status: 'added',
              timestamp: Date.now(),
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === msg.id ? { ...m, status: 'added' } : m))
            );
            window.dispatchEvent(
              new CustomEvent('bloom:chat-message', {
                detail: {
                  text: `"${msg.track?.title}" was added to queue by majority vote (${agreeCount}/${totalPeers} agreed)!`,
                  type: 'system',
                  sender: 'System',
                  timestamp: Date.now(),
                },
              })
            );
          }
        }
      }
    });
  }, [messages, isHost, addToQueue, chatDb, peers, peerRoles, peerId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="absolute top-2 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/50 hover:bg-black/60 hover:text-white transition-all backdrop-blur-sm"
        title={soundEnabled ? 'Mute Notifications' : 'Unmute Notifications'}
      >
        <span className="material-symbols-rounded text-[18px]">
          {soundEnabled ? 'notifications_active' : 'notifications_off'}
        </span>
      </button>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 pt-12">
        {!chatDb || status === 'initializing' ? (
          <div className="flex flex-col gap-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-4 bg-white/5 rounded-md animate-pulse"
                style={{ width: `${50 + i * 8}%` }}
              />
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
              ) : msg.type === 'recommendation' ? (
                <div className="flex flex-col bg-white/[0.06] hover:bg-white/[0.08] rounded-2xl p-3.5 my-1.5 gap-2.5 max-w-sm transition-all shadow-md">
                  {/* Recommender Header */}
                  <div className="flex items-center justify-between text-xs text-white/50 pb-1">
                    <div className="flex items-center gap-1.5 font-medium truncate min-w-0">
                      <span style={{ color: getPeerColor(msg.peerId) }} className="font-semibold truncate">
                        {msg.sender}
                      </span>
                      <span className="text-white/40 shrink-0">recommended</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] font-mono text-white/30 tabular-nums">
                        {formatDuration(msg.track?.duration)}
                      </span>
                      {(msg.peerId === peerId || isHost || peerRoles?.[peerId] === 'owner' || peerRoles?.[peerId] === 'admin') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRecommendation(msg.id)}
                          className="w-5 h-5 flex items-center justify-center rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                          title="Delete recommendation"
                        >
                          <span className="material-symbols-rounded text-[15px] leading-none">close</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Track Tile (zero strokes) */}
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white/10 shrink-0 shadow">
                      <img src={msg.track?.thumbnail} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold truncate text-white tracking-wide" title={msg.track?.title}>
                        {msg.track?.title}
                      </h4>
                      <p className="text-[11px] text-white/50 font-medium truncate mt-0.5" title={msg.track?.author}>
                        {msg.track?.author}
                      </p>
                    </div>
                  </div>

                  {/* Voting Actions or Final Status Banner */}
                  {msg.status === 'added' ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white/90 bg-white/10 py-1.5 px-4 rounded-full animate-in fade-in duration-200">
                      <span className="material-symbols-rounded text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>Added to Queue</span>
                    </div>
                  ) : msg.status === 'rejected' ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-white/50 bg-white/[0.06] py-1.5 px-4 rounded-full animate-in fade-in duration-200">
                      <span className="material-symbols-rounded text-base">cancel</span>
                      <span>Rejected by Host</span>
                    </div>
                  ) : (() => {
                    const agreeCount = Object.values(msg.votes || {}).filter((v) => v === 'agree').length;
                    const disagreeCount = Object.values(msg.votes || {}).filter((v) => v === 'disagree').length;
                    const totalPeers = peers && peers.length > 0 ? peers.length : 1;
                    const neededVotes = Math.ceil(totalPeers * 0.5);
                    const progressPct = Math.min(100, Math.round((agreeCount / totalPeers) * 100));
                    return (
                      <div className="flex flex-col gap-2 pt-0.5">
                        {/* Vote progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white/70 rounded-full transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-white/40 font-mono tabular-nums shrink-0">
                            {agreeCount}/{totalPeers} · {neededVotes} needed
                          </span>
                        </div>
                        {/* Vote Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleVote(msg.id, 'agree')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-4 rounded-full text-xs font-bold transition-all select-none active:scale-95 shadow-sm ${
                              msg.votes?.[peerId] === 'agree'
                                ? 'bg-white text-black ring-2 ring-white/40 scale-[1.02]'
                                : 'bg-white text-black hover:bg-white/90'
                            }`}
                          >
                            <span
                              className="material-symbols-rounded text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              thumb_up
                            </span>
                            <span>Agree ({agreeCount})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleVote(msg.id, 'disagree')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-4 rounded-full text-xs font-bold transition-all select-none active:scale-95 shadow-sm ${
                              msg.votes?.[peerId] === 'disagree'
                                ? 'bg-white/25 text-white ring-1 ring-white/30 scale-[1.02]'
                                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                            }`}
                          >
                            <span
                              className="material-symbols-rounded text-sm"
                              style={{ fontVariationSettings: msg.votes?.[peerId] === 'disagree' ? "'FILL' 1" : undefined }}
                            >
                              thumb_down
                            </span>
                            <span>Disagree ({disagreeCount})</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : msg.type === 'gif-group' ? (
                <div className="text-sm flex items-start gap-1.5">
                  <div className="font-bold shrink-0 flex items-center gap-1.5 leading-[1.4]">
                    <span style={{ color: getPeerColor(msg.peerId) }}>{msg.sender}</span>
                    {(peerRoles?.[msg.peerId] === 'owner' || (isHost && msg.peerId === peerId)) && (
                      <div className="bg-purple-600 px-2 py-0.5 rounded-full flex items-center justify-center" title="Owner">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                          crown
                        </span>
                      </div>
                    )}
                    {peerRoles?.[msg.peerId] === 'admin' && (
                      <div className="bg-yellow-500 px-2 py-0.5 rounded-full flex items-center justify-center" title="Admin">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                          award_star
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`grid gap-1 ${
                      msg.images.length === 1
                        ? 'grid-cols-1'
                        : msg.images.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                    }`}
                    style={{
                      maxWidth:
                        msg.images.length === 1
                          ? '120px'
                          : msg.images.length === 2
                          ? '190px'
                          : '270px',
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
              ) : (msg.text && typeof msg.text === 'string' && msg.text.trim()) ? (
                <div className="text-sm flex items-start gap-1.5">
                  <div className="font-bold shrink-0 flex items-center gap-1.5 leading-[1.4]">
                    <span style={{ color: getPeerColor(msg.peerId) }}>{msg.sender || 'Anonymous'}</span>
                    {(peerRoles?.[msg.peerId] === 'owner' || (isHost && msg.peerId === peerId)) && (
                      <div className="bg-purple-600 px-2 py-0.5 rounded-full flex items-center justify-center" title="Owner">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                          crown
                        </span>
                      </div>
                    )}
                    {peerRoles?.[msg.peerId] === 'admin' && (
                      <div className="bg-yellow-500 px-2 py-0.5 rounded-full flex items-center justify-center" title="Admin">
                        <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                          award_star
                        </span>
                      </div>
                    )}
                    <span className="text-white/50">:</span>
                  </div>
                  <span className="text-white/90 break-words min-w-0 leading-[1.4]">{msg.text}</span>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {showGifs && (
        <GifPicker
          onSelect={(url) => {
            handleSendGif(url);
            setShowGifs(false);
          }}
          onClose={() => setShowGifs(false)}
        />
      )}

      {showRecommend && (
        <RecommendSongModal
          onSelect={handleSelectRecommend}
          onClose={() => setShowRecommend(false)}
        />
      )}

      {/* Spacer for floating mobile player */}
      <div className="h-[80px] lg:hidden shrink-0 pointer-events-none" />

      <div className="p-4 border-t border-white/[0.06] bg-black/20">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowGifs(!showGifs)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
              showGifs
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-white/10 text-white/40 hover:bg-white/15 hover:text-white/70'
            }`}
            title="Send GIF"
          >
            <span className="material-symbols-rounded text-[26px] leading-none">gif_box</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRecommend(true)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
              showRecommend
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-white/10 text-white/40 hover:bg-white/15 hover:text-white/70'
            }`}
            title="Recommend a song to party"
          >
            <span className="material-symbols-rounded text-[24px] leading-none">queue_music</span>
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

