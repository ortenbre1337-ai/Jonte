import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Swords, 
  Zap, 
  User, 
  Trophy, 
  Skull, 
  ArrowRight,
  Plus,
  Image as ImageIcon,
  Bot,
  Clock,
  Volume2,
  VolumeX,
  Gem,
  Layout,
  Trash2,
  Copy,
  Check,
  Search,
  X,
  Edit2,
  Droplet,
  Sword,
  ArrowUpDown,
  RefreshCw,
  WifiOff,
  Target,
  Flame
} from 'lucide-react';
import { GameState, Card, GameAction, ServerMessage } from './types';
import { TURN_CHANGE_SFX, CARD_POOL, encodeDeck, decodeDeck } from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isAI, setIsAI] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<'attack' | 'ability' | 'spell' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [view, setView] = useState<'menu' | 'game' | 'deck-builder'>('menu');
  const [savedDecks, setSavedDecks] = useState<Card[][]>(() => {
    const saved = localStorage.getItem('kumpurei_decks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const decoded = parsed.map(code => decodeDeck(code));
          // Ensure we have at least 9 slots
          if (decoded.length < 9) {
            return [...decoded, ...Array(9 - decoded.length).fill([]).map(() => [])];
          }
          return decoded.slice(0, 9);
        }
      } catch (e) {
        console.error("Failed to parse saved decks", e);
      }
    }
    // Default to 9 empty decks
    return Array(9).fill([]).map(() => []);
  });
  const [deckNames, setDeckNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('kumpurei_deck_names');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          if (parsed.length < 9) {
            return [...parsed, ...Array(9 - parsed.length).fill(null).map((_, i) => `Deck Slot ${parsed.length + i + 1}`)];
          }
          return parsed.slice(0, 9);
        }
      } catch (e) {
        console.error("Failed to parse deck names", e);
      }
    }
    return Array(9).fill(null).map((_, i) => `Deck Slot ${i + 1}`);
  });
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [deckCode, setDeckCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const [selectedMulliganIds, setSelectedMulliganIds] = useState<string[]>([]);
  const [activeProjectiles, setActiveProjectiles] = useState<{ 
    id: string; 
    x: number; 
    y: number; 
    tx?: number; 
    ty?: number; 
    type: 'bullet' | 'soul' 
  }[]>([]);
  const [explosions, setExplosions] = useState<{ id: string; x: number; y: number; }[]>([]);
  const [kebabAnimations, setKebabAnimations] = useState<{ id: string; startX: number; startY: number; endX: number; endY: number; }[]>([]);
  const [urgeAnimations, setUrgeAnimations] = useState<{ id: string; startX: number; startY: number; endX: number; endY: number; }[]>([]);
  const [jizzAnimations, setJizzAnimations] = useState<{ id: string; }[]>([]);
  const [bkCrownAnimations, setBkCrownAnimations] = useState<{ id: string; startX: number; startY: number; endX: number; endY: number; }[]>([]);
  const [fireballAnimations, setFireballAnimations] = useState<{ id: string; startX: number; startY: number; endX: number; endY: number; delay: number; }[]>([]);
  const [charmAnimations, setCharmAnimations] = useState<{ id: string; x: number; y: number; }[]>([]);
  const [showLog, setShowLog] = useState(true);
  const [pulsingCardIds, setPulsingCardIds] = useState<Record<string, number>>({});

  const socketRef = useRef<WebSocket | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prevGraveyardSize = useRef<number>(0);
  const prevMyGraveyardSize = useRef<number>(0);
  const prevTurn = useRef<string | null>(null);
  const logTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processedAnimationIds = useRef<Set<string>>(new Set());

  // Sound playing logic
  useEffect(() => {
    if (!gameState?.lastAction || isMuted) return;

    const { action, playerId } = gameState.lastAction;
    const players = gameState.players;
    const player = players[playerId];
    
    const playSound = (url: string) => {
      const audio = new Audio(url);
      audio.volume = 0.4;
      audio.play().catch(e => console.log("Sound play blocked", e));
    };

    const getSound = (card: Card, type: keyof Card['sounds']) => {
      return card.sounds[type] || card.sounds.play || '';
    };

    if (action.type === 'PLAY_CARD') {
      const card = player.board.find(c => c.id === action.cardId) || player.graveyard.find(c => c.id === action.cardId);
      if (card) {
        const sound = getSound(card, 'play');
        if (sound) playSound(sound);
      }
    } else if (action.type === 'ATTACK_CARD' || action.type === 'ATTACK_PLAYER') {
      const attackerId = (action as any).attackerId;
      const card = player.board.find(c => c.id === attackerId);
      if (card) {
        const sound = getSound(card, 'attack');
        if (sound) playSound(sound);
      }
    } else if (action.type === 'USE_ABILITY') {
      const card = player.board.find(c => c.id === action.cardId);
      if (card) {
        const sound = getSound(card, 'ability');
        if (sound) playSound(sound);

        // Kirin Bullet Animation
        if (card.name === 'Kirin') {
          const cardElement = document.querySelector(`[data-card-id="${card.id}"]`);
          if (cardElement) {
            const rect = cardElement.getBoundingClientRect();
            const newProjectile = {
              id: Math.random().toString(36).substr(2, 9),
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              tx: window.innerWidth / 2,
              ty: 50, // Travel further up
              type: 'bullet' as const
            };
            setActiveProjectiles(prev => [...prev, newProjectile]);
            setTimeout(() => {
              setActiveProjectiles(prev => prev.filter(p => p.id !== newProjectile.id));
            }, 800); // Match slower duration
          }
        }
      }
    }

    // Battle Log Auto-hide
    setShowLog(true);
    if (logTimerRef.current) clearTimeout(logTimerRef.current);
    logTimerRef.current = setTimeout(() => setShowLog(false), 1000);

    // Handle death sounds by checking graveyard changes
    const currentGraveyardSize = (Object.values(players) as any[]).reduce((acc, p) => acc + (p.graveyard?.length || 0), 0);
    const myGraveyard = players[myId]?.graveyard || [];
    const currentMyGraveyardSize = myGraveyard.length;

    if (currentGraveyardSize > prevGraveyardSize.current) {
      const allGraveyards = (Object.values(players) as any[]).flatMap(p => p.graveyard || []);
      const lastDeadCard = allGraveyards[allGraveyards.length - 1];
      if (lastDeadCard) {
        const sound = getSound(lastDeadCard, 'death');
        if (sound) playSound(sound);
      }
    }

    // John Satanist Soul Logic
    if (currentMyGraveyardSize > prevMyGraveyardSize.current) {
      const johns = players[myId].board.filter(c => c.name === 'John Satanist');
      if (johns.length > 0) {
        const newDeadCards = myGraveyard.slice(prevMyGraveyardSize.current);
        
        newDeadCards.forEach(deadCard => {
          const deadElem = document.querySelector(`[data-card-id="${deadCard.id}"]`);
          if (deadElem) {
            const deadRect = deadElem.getBoundingClientRect();
            const startX = deadRect.left + deadRect.width / 2;
            const startY = deadRect.top + deadRect.height / 2;

            johns.forEach(john => {
              const johnElem = document.querySelector(`[data-card-id="${john.id}"]`);
              if (johnElem) {
                const johnRect = johnElem.getBoundingClientRect();
                const endX = johnRect.left + johnRect.width / 2;
                const endY = johnRect.top + johnRect.height / 2;

                const soulId = `soul-${Math.random().toString(36).substr(2, 9)}`;
                setActiveProjectiles(prev => [...prev, { 
                  id: soulId, 
                  x: startX, 
                  y: startY, 
                  tx: endX, 
                  ty: endY, 
                  type: 'soul' 
                }]);

                setTimeout(() => {
                  setActiveProjectiles(prev => prev.filter(p => p.id !== soulId));
                  setPulsingCardIds(prev => ({ ...prev, [john.id]: Date.now() }));
                }, 1000); // Slower duration
              }
            });
          }
        });
      }
    }

    prevGraveyardSize.current = currentGraveyardSize;
    prevMyGraveyardSize.current = currentMyGraveyardSize;

  }, [gameState?.lastAction?.timestamp, isMuted]);

  useEffect(() => {
    if (gameState?.animations) {
      gameState.animations.forEach(anim => {
        if (!processedAnimationIds.current.has(anim.id)) {
          processedAnimationIds.current.add(anim.id);
          if (anim.type === 'explosion') {
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`);
            if (targetElement) {
              const rect = targetElement.getBoundingClientRect();
              setExplosions(prev => [...prev, { id: anim.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
              setTimeout(() => {
                setExplosions(prev => prev.filter(e => e.id !== anim.id));
              }, 1000);
            }
          } else if (anim.type === 'kebab') {
            const sourceElement = document.querySelector(`[data-card-id="${anim.sourceId}"]`);
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`);
            if (sourceElement && targetElement) {
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();
              setKebabAnimations(prev => [...prev, { id: anim.id, startX: sourceRect.left + sourceRect.width / 2, startY: sourceRect.top + sourceRect.height / 2, endX: targetRect.left + targetRect.width / 2, endY: targetRect.top + targetRect.height / 2 }]);
              setTimeout(() => {
                setKebabAnimations(prev => prev.filter(e => e.id !== anim.id));
              }, 1000);
            }
          } else if (anim.type === 'bk-crown') {
            const sourceElement = document.querySelector(`[data-card-id="${anim.sourceId}"]`);
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`);
            if (sourceElement && targetElement) {
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();
              setBkCrownAnimations(prev => [...prev, { id: anim.id, startX: sourceRect.left + sourceRect.width / 2, startY: sourceRect.top + sourceRect.height / 2, endX: targetRect.left + targetRect.width / 2, endY: targetRect.top + targetRect.height / 2 }]);
              setTimeout(() => {
                setBkCrownAnimations(prev => prev.filter(e => e.id !== anim.id));
              }, 4000);
            }
          } else if (anim.type === 'urge') {
            const sourceElement = document.querySelector(`[data-card-id="${anim.sourceId}"]`);
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`);
            if (sourceElement && targetElement) {
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();
              setUrgeAnimations(prev => [...prev, { id: anim.id, startX: sourceRect.left + sourceRect.width / 2, startY: sourceRect.top + sourceRect.height / 2, endX: targetRect.left + targetRect.width / 2, endY: targetRect.top + targetRect.height / 2 }]);
              setTimeout(() => {
                setUrgeAnimations(prev => prev.filter(e => e.id !== anim.id));
              }, 1500);
            }
          } else if (anim.type === 'jizzsperm') {
            setJizzAnimations(prev => [...prev, { id: anim.id }]);
            setTimeout(() => {
              setJizzAnimations(prev => prev.filter(e => e.id !== anim.id));
            }, 10000);
          } else if (anim.type === 'fireball') {
            const sourceElement = document.querySelector(`[data-card-id="${anim.sourceId}"]`);
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`) || document.querySelector(`[data-player-id="${anim.targetId}"]`);
            if (sourceElement && targetElement) {
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();
              
              // Find index of this fireball among all fireballs in this update to apply sequential delay
              const fireballIndex = gameState.animations.filter(a => a.type === 'fireball').findIndex(a => a.id === anim.id);
              const delay = fireballIndex * 1.5; // 1.5s delay per fireball

              setFireballAnimations(prev => [...prev, { 
                id: anim.id, 
                startX: sourceRect.left + sourceRect.width / 2, 
                startY: sourceRect.top + sourceRect.height / 2, 
                endX: targetRect.left + targetRect.width / 2, 
                endY: targetRect.top + targetRect.height / 2,
                delay
              }]);
              
              setTimeout(() => {
                setFireballAnimations(prev => prev.filter(e => e.id !== anim.id));
              }, (delay + 1.5) * 1000 + 500);
            }
          } else if (anim.type === 'charm') {
            const targetElement = document.querySelector(`[data-card-id="${anim.targetId}"]`);
            if (targetElement) {
              const rect = targetElement.getBoundingClientRect();
              setCharmAnimations(prev => [...prev, { id: anim.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
              setTimeout(() => {
                setCharmAnimations(prev => prev.filter(e => e.id !== anim.id));
              }, 2000);
            }
          }
        }
      });
    }
  }, [gameState?.animations]);

  // Turn change sound
  useEffect(() => {
    if (!gameState || isMuted) return;
    if (prevTurn.current && prevTurn.current !== gameState.turn) {
      const audio = new Audio(TURN_CHANGE_SFX);
      audio.volume = 0.4;
      audio.play().catch(e => console.log("Turn sound blocked", e));
    }
    prevTurn.current = gameState.turn;
  }, [gameState?.turn, isMuted]);

  useEffect(() => {
    if (gameState?.status === 'playing' && audioRef.current) {
      audioRef.current.volume = 0.3;
      if (!isMuted) {
        audioRef.current.play().catch(e => console.log("Audio play blocked", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [gameState?.status, isMuted]);

  useEffect(() => {
    if (isJoined) {
      const wsUrl = import.meta.env.VITE_WS_URL;
      const appUrl = import.meta.env.VITE_APP_URL; // Optional: fallback to known app URL
      
      console.log('Connecting to WebSocket. VITE_WS_URL:', wsUrl);
      let socket: WebSocket;

      if (wsUrl) {
        socket = new WebSocket(wsUrl);
      } else if (window.location.protocol === 'file:') {
        // In Electron/file protocol, we MUST have a VITE_WS_URL to connect online
        console.error("No VITE_WS_URL provided. Online play will not work in desktop mode.");
        setError("Connection error: No server URL configured for desktop mode.");
        return;
      } else {
        // Default to current host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        
        // If we are on a known static host or a different host than our backend,
        // we might want to try to connect to the backend URL if we know it.
        let targetHost = host;
        if (host.includes('localhost:5173')) {
          targetHost = 'localhost:3000';
        } else if (appUrl && !host.includes(new URL(appUrl).host)) {
          // If we are on a different host and have a known APP_URL, use that for WS
          const appUrlObj = new URL(appUrl);
          const appProtocol = appUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
          const finalUrl = `${appProtocol}//${appUrlObj.host}`;
          console.log('Detected different host, falling back to APP_URL for WebSocket:', finalUrl);
          socket = new WebSocket(finalUrl);
          socketRef.current = socket;
          setupSocket(socket);
          return;
        }
        
        const finalUrl = `${protocol}//${targetHost}`;
        console.log('Using detected WebSocket URL:', finalUrl);
        socket = new WebSocket(finalUrl);
      }

      socketRef.current = socket;
      setupSocket(socket);

      return () => {
        if (socketRef.current) {
          socketRef.current.close();
        }
      };
    }
  }, [isJoined, roomId, playerName, isAI]);

  const setupSocket = (socket: WebSocket) => {
    socket.onopen = () => {
      const activeDeck = savedDecks[activeDeckIndex];
      socket.send(JSON.stringify({
        action: { 
          type: 'JOIN_ROOM', 
          roomId, 
          playerName, 
          isAI,
          deck: activeDeck.length === 20 ? activeDeck : undefined
        }
      }));
    };

    socket.onmessage = (event) => {
      const data: ServerMessage = JSON.parse(event.data);
      if (data.type === 'STATE_UPDATE') {
        setGameState(data.state);
        setMyId(data.yourId);
      }
    };

    socket.onerror = (e) => {
      console.error('WebSocket error:', e);
      setError('WebSocket connection error. Make sure the server is running.');
    };
    
    socket.onclose = (e) => {
      console.log('WebSocket closed:', e.code, e.reason);
      setIsJoined(false);
    };
  };

  const sendAction = (action: GameAction) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action }));
    }
  };

  const handleJoin = (e: React.FormEvent, playWithAI: boolean = false) => {
    e.preventDefault();
    if (roomId && playerName) {
      setIsAI(playWithAI);
      setIsJoined(true);
      setView('game');
    }
  };

  const handleLoadDeck = () => {
    if (!deckCode) return;
    const deck = decodeDeck(deckCode);
    if (deck.length > 0) {
      const newDecks = [...savedDecks];
      newDecks[activeDeckIndex] = deck;
      setSavedDecks(newDecks);
      const codes = newDecks.map(d => encodeDeck(d));
      localStorage.setItem('kumpurei_decks', JSON.stringify(codes));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } else {
      setError('Invalid deck code');
    }
  };

  if (view === 'deck-builder') {
    return (
      <DeckBuilder 
        onBack={() => setView('menu')} 
        savedDecks={savedDecks} 
        initialDeckIndex={activeDeckIndex}
        deckNames={deckNames}
        onSaveNames={(names) => {
          setDeckNames(names);
          localStorage.setItem('kumpurei_deck_names', JSON.stringify(names));
        }}
        onSave={(decks, index) => {
          setSavedDecks(decks);
          setActiveDeckIndex(index);
          const codes = decks.map(d => encodeDeck(d));
          localStorage.setItem('kumpurei_decks', JSON.stringify(codes));
        }} 
      />
    );
  }

  if (!isJoined) {
    return (
      <div 
        className="min-h-screen text-white flex items-center justify-center p-4 font-sans relative overflow-hidden"
        style={{ 
          backgroundImage: 'url(/background.png)', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* Atmospheric Overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative max-w-md w-full bg-[#151619]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <Swords className="w-10 h-10 text-emerald-500" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-center mb-2 tracking-tighter text-white">KUMPUREI</h1>
          <p className="text-emerald-500/60 text-center mb-10 text-xs uppercase tracking-[0.4em] font-medium">Battle of Gods</p>
          
          <form onSubmit={(e) => handleJoin(e, false)} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 ml-1">Champion Name</label>
              <input 
                type="text" 
                placeholder="Enter your name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 ml-1">Battle Realm ID</label>
              <input 
                type="text" 
                placeholder="Room code..."
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                type="button"
                onClick={() => setView('deck-builder')}
                className="col-span-2 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-400 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-emerald-500/20 flex items-center justify-center gap-2 mb-2"
              >
                <Layout className="w-4 h-4" /> Deck Builder
              </button>
              <button 
                type="submit"
                disabled={!playerName || !roomId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
              >
                PvP Duel <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={(e) => handleJoin(e as any, true)}
                disabled={!playerName || !roomId}
                className="bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                vs AI <Bot className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-6 border-t border-white/5 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 ml-1">Import Deck Code</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Paste code here..."
                  value={deckCode}
                  onChange={(e) => setDeckCode(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10 font-mono"
                />
                <button 
                  type="button"
                  onClick={handleLoadDeck}
                  className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"
                >
                  {copySuccess ? <Check className="w-4 h-4 text-emerald-500" /> : <Plus className="w-4 h-4 text-white/60" />}
                </button>
              </div>
              {savedDecks[activeDeckIndex].length > 0 && (
                <p className="text-[8px] text-emerald-500/60 font-bold uppercase tracking-widest text-center">
                  {deckNames[activeDeckIndex]} Loaded ({savedDecks[activeDeckIndex].length}/20)
                </p>
              )}
            </div>
          </form>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] text-center font-bold uppercase tracking-wider"
            >
              {error}
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  if (!gameState || !myId) {
    return (
      <div 
        className="min-h-screen text-white flex items-center justify-center p-4 font-sans relative overflow-hidden"
        style={{ 
          backgroundImage: 'url(/background.png)', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
        <div className="relative flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_20px_rgba(16,185,129,0.2)]" />
          <div className="flex flex-col items-center gap-2">
            <p className="text-white font-black tracking-tighter text-xl animate-pulse uppercase">Entering Realm...</p>
            <p className="text-white/30 text-[10px] uppercase tracking-[0.3em] font-bold">Summoning {playerName}</p>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-bold uppercase tracking-wider">
              {error}
              <button onClick={() => window.location.reload()} className="ml-4 underline">Retry</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const me = gameState.players[myId];
  const opponentId = Object.keys(gameState.players).find(id => id !== myId);
  const opponent = opponentId ? gameState.players[opponentId] : null;
  const isMyTurn = gameState.turn === myId;

  const isCursedDomainActive = Object.values(gameState.players).some((p: any) => 
    p.board.some((c: Card) => c.passive?.effect === 'cursed_domain')
  );

  const isServerLagActive = !!gameState.serverLag[myId];

  const isSmokeFieldActive = Object.values(gameState.players).some((p: any) => 
    p.board.some((c: Card) => c.passive?.effect === 'smoke_field')
  );

  const handleCardClick = (card: Card, location: 'hand' | 'board' | 'opponentBoard') => {
    if (gameState.status === 'mulligan') {
      if (location === 'hand') {
        setSelectedMulliganIds(prev => 
          prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]
        );
      }
      return;
    }

    if (!isMyTurn) return;

    if (location === 'hand') {
      if (card.category === 'spell' && isCursedDomainActive) return;
      if (me.mana >= card.manaCost) {
        const targetedSpellEffects = ['damage_enemy_card', 'damage_enemy_card_or_champion', 'buff_card_stats', 'buff_jesper_v2', 'debuff_enemy_attack', 'buff_friendly_attack', 'prevent_death', 'debuff_card_stats', 'banish_unit', 'mark_vulnerable'];
        if (card.category === 'spell' && targetedSpellEffects.includes(card.ability.effect)) {
          if (selectedCardId === card.id && targetMode === 'spell') {
            setSelectedCardId(null);
            setTargetMode(null);
          } else {
            setSelectedCardId(card.id);
            setTargetMode('spell');
          }
        } else if (me.board.length < 4 || card.category === 'spell') {
          sendAction({ type: 'PLAY_CARD', cardId: card.id });
        }
      }
    } else if (location === 'board') {
      if (selectedCardId && targetMode === 'spell') {
        sendAction({ type: 'PLAY_CARD', cardId: selectedCardId, targetId: card.id });
        setSelectedCardId(null);
        setTargetMode(null);
        return;
      }
      if (selectedCardId && targetMode === 'ability') {
        const actingCard = me.board.find(c => c.id === selectedCardId);
        const friendlyEffects = ['heal_target_card', 'heal_friendly_target', 'heal_friendly_random_range', 'buff_card_stats', 'buff_friendly_attack', 'consume_friendly_card', 'protect_friendly_card', 'switch_stats', 'copy_unit_to_hand'];
        if (actingCard && friendlyEffects.includes(actingCard.ability.effect)) {
          sendAction({ type: 'USE_ABILITY', cardId: selectedCardId, targetId: card.id, targetType: 'card' });
          setSelectedCardId(null);
          setTargetMode(null);
          return;
        }
      }
      if (selectedCardId === card.id) {
        setSelectedCardId(null);
        setTargetMode(null);
      } else {
        setSelectedCardId(card.id);
        setTargetMode('attack');
      }
    } else if (location === 'opponentBoard') {
      if (selectedCardId && targetMode === 'spell') {
        sendAction({ type: 'PLAY_CARD', cardId: selectedCardId, targetId: card.id });
        setSelectedCardId(null);
        setTargetMode(null);
        return;
      }
      if (selectedCardId && targetMode === 'attack') {
        sendAction({ type: 'ATTACK_CARD', attackerId: selectedCardId, targetId: card.id });
        setSelectedCardId(null);
        setTargetMode(null);
      } else if (selectedCardId && targetMode === 'ability') {
        const actingCard = me.board.find(c => c.id === selectedCardId);
        if (actingCard && actingCard.ability.effect !== 'heal_friendly_target' && actingCard.ability.effect !== 'heal_friendly_random_range' && actingCard.ability.effect !== 'consume_friendly_card' && actingCard.ability.effect !== 'protect_friendly_card') {
          sendAction({ type: 'USE_ABILITY', cardId: selectedCardId, targetId: card.id, targetType: 'card' });
          setSelectedCardId(null);
          setTargetMode(null);
        }
      }
    }
  };

  const handleOpponentPlayerClick = () => {
    if (!isMyTurn || !selectedCardId) return;

    if (targetMode === 'attack' && opponent?.board.length === 0) {
      sendAction({ type: 'ATTACK_PLAYER', attackerId: selectedCardId });
      setSelectedCardId(null);
      setTargetMode(null);
    } else if (targetMode === 'spell') {
      const card = me.hand.find(c => c.id === selectedCardId);
      if (card && card.ability.effect === 'damage_enemy_card_or_champion') {
        sendAction({ type: 'PLAY_CARD', cardId: selectedCardId, targetId: opponentId });
        setSelectedCardId(null);
        setTargetMode(null);
      }
    } else if (targetMode === 'ability') {
      const actingCard = me.board.find(c => c.id === selectedCardId);
      if (actingCard && actingCard.ability.effect !== 'heal_friendly_target' && actingCard.ability.effect !== 'heal_friendly_random_range' && actingCard.ability.effect !== 'consume_friendly_card' && actingCard.ability.effect !== 'protect_friendly_card') {
        sendAction({ type: 'USE_ABILITY', cardId: selectedCardId, targetId: opponentId, targetType: 'player' });
        setSelectedCardId(null);
        setTargetMode(null);
      }
    }
  };

  const handleMyPlayerClick = () => {
    if (!isMyTurn || !selectedCardId) return;

    if (targetMode === 'ability') {
      sendAction({ type: 'USE_ABILITY', cardId: selectedCardId, targetId: myId, targetType: 'player' });
      setSelectedCardId(null);
      setTargetMode(null);
    }
  };

  const getAbilityCost = (card: Card) => {
    let cost = card.ability.manaCost;
    if (me.board.some(c => c.passive?.effect === 'reduce_ability_cost')) {
      cost = Math.max(0, cost - 1);
    }
    return cost;
  };

  const handleUseAbility = (card: Card) => {
    if (isServerLagActive) return;
    const actualCost = getAbilityCost(card);
    if (!isMyTurn || me.mana < actualCost || card.hasUsedAbility) return;

    // Check board space for summoning/borrowing abilities
    if ((card.ability.effect === 'borrow_enemy_unit' || card.ability.effect === 'summon_token') && me.board.length >= 4) {
      return;
    }
    if (card.ability.effect === 'summon_token_enemy_board' && opponent && opponent.board.length >= 4) {
      return;
    }

    const targetingEffects = [
      'damage_enemy_card', 
      'heal_target_card', 
      'heal_friendly_target',
      'heal_friendly_random_range',
      'heal_target_random_range', 
      'buff_card_stats', 
      'debuff_enemy_attack', 
      'buff_friendly_attack', 
      'consume_friendly_card',
      'borrow_enemy_unit',
      'protect_friendly_card',
      'switch_stats',
      'copy_unit_to_hand'
    ];

    if (targetingEffects.includes(card.ability.effect)) {
      setSelectedCardId(card.id);
      setTargetMode('ability');
    } else {
      sendAction({ type: 'USE_ABILITY', cardId: card.id });
    }
  };

  const handleDragEnd = (_: any, info: any, card: Card) => {
    if (!boardRef.current || !isMyTurn) return;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const { x, y } = info.point;

    if (
      x >= boardRect.left &&
      x <= boardRect.right &&
      y >= boardRect.top &&
      y <= boardRect.bottom
    ) {
      if (card.category === 'spell' && isCursedDomainActive) return;
      if (me.mana >= card.manaCost && (me.board.length < 4 || card.category === 'spell')) {
        sendAction({ type: 'PLAY_CARD', cardId: card.id });
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans overflow-hidden select-none">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
            <Swords className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="font-black tracking-tighter text-lg uppercase">KUMPUREI</span>
          <div className="h-4 w-px bg-white/10 mx-2" />
          <span className="text-[10px] text-emerald-500/60 uppercase tracking-[0.2em] font-bold">Battle of Gods</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-black/60 px-4 py-1.5 rounded-full border border-white/10 shadow-xl">
            <Clock className={cn("w-4 h-4", gameState.timer <= 10 ? "text-red-500 animate-pulse" : "text-white/40")} />
            <span className={cn("text-sm font-mono font-bold", gameState.timer <= 10 ? "text-red-500" : "text-white")}>{gameState.timer}s</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isMyTurn ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-white/20"
            )} />
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              isMyTurn ? "text-emerald-500" : "text-white/40"
            )}>
              {isMyTurn ? "Your Turn" : "Enemy Champion's Turn"}
            </span>
          </div>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white/40 hover:text-white"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
          </button>
          <button 
            onClick={() => sendAction({ type: 'END_TURN' })}
            disabled={!isMyTurn}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
              isMyTurn 
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                : "bg-white/5 text-white/20 cursor-not-allowed"
            )}
          >
            End Turn
          </button>
        </div>
      </div>

      {/* Game Board */}
      <div 
        className="flex-1 relative flex flex-col p-4 gap-4 overflow-hidden"
        style={{ 
          backgroundImage: 'url(/background.png)', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <audio ref={audioRef} src="/music.mp3" loop />

        {isSmokeFieldActive && <SmokeFieldOverlay />}

        {activeProjectiles.map(p => (
          <motion.div
            key={p.id}
            initial={{ x: p.x, y: p.y, opacity: 1, scale: p.type === 'soul' ? 0.5 : 1 }}
            animate={{ 
              x: p.tx !== undefined ? p.tx : window.innerWidth / 2, 
              y: p.ty !== undefined ? p.ty : 150, 
              opacity: 0, 
              scale: p.type === 'soul' ? 1.5 : 0.5 
            }}
            transition={{ 
              duration: p.type === 'bullet' ? 0.8 : 1.0, 
              ease: "easeIn" 
            }}
            className={cn(
              "fixed z-[100] pointer-events-none",
              p.type === 'bullet' ? "w-6 h-1.5 bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)]" : "w-8 h-8 bg-purple-600/60 rounded-full blur-sm shadow-[0_0_25px_rgba(168,85,247,0.9)]"
            )}
            style={{ transform: p.type === 'bullet' ? 'rotate(-90deg)' : 'none' }}
          >
            {p.type === 'soul' && (
              <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
            )}
          </motion.div>
        ))}

        {/* Enemy Champion Mana (Top Right) */}
        <div className="absolute right-6 top-6 z-40 flex flex-col items-end gap-2">
          <div className="flex gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Gem 
                key={i} 
                className={cn(
                  "w-5 h-5 transition-all duration-500",
                  i < (opponent?.mana || 0) ? "text-blue-400 fill-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)]" : "text-white/5",
                  i >= (opponent?.maxMana || 0) && i >= (opponent?.mana || 0) && "opacity-0"
                )} 
              />
            ))}
          </div>
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Mana: {opponent?.mana}/{opponent?.maxMana}</span>
        </div>

        {/* Player Mana (Bottom Left) */}
        <div className="absolute left-6 bottom-6 z-40 flex flex-col items-start gap-2">
          <div className="flex gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Gem 
                key={i} 
                className={cn(
                  "w-5 h-5 transition-all duration-500",
                  i < me.mana ? "text-blue-400 fill-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)]" : "text-white/5",
                  i >= me.maxMana && i >= me.mana && "opacity-0"
                )} 
              />
            ))}
          </div>
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Mana: {me.mana}/{me.maxMana}</span>
        </div>

        {/* Opponent Deck (Top Left) */}
        <div className="absolute left-6 top-6 z-40">
          <DeckStack count={opponent?.deck.length || 0} maxCount={20} label="Enemy Champion Deck" />
        </div>

        {/* Player Deck (Bottom Right) */}
        <div className="absolute right-6 bottom-6 z-40">
          <DeckStack count={me.deck.length} maxCount={20} label="Friendly Champion Deck" />
        </div>
        
        {/* Action Log Overlay */}
        <div className="absolute left-6 top-24 w-64 h-[400px] z-40 group pointer-events-none">
          <div className={cn(
            "flex flex-col gap-2 transition-opacity duration-500 pointer-events-auto min-h-[200px]",
            showLog ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}>
            <AnimatePresence initial={false}>
              {gameState.history.slice(-5).reverse().map((record, i) => (
                <motion.div
                  key={record.timestamp + i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl text-[10px] shadow-xl"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      record.playerId === myId ? "bg-emerald-500" : "bg-red-500"
                    )} />
                    <span className="font-bold text-white/60 uppercase tracking-wider">
                      {gameState.players[record.playerId]?.name}
                    </span>
                  </div>
                  <p className="text-white/90 font-medium">
                    {record.action.type === 'PLAY_CARD' && (() => {
                      const baseId = (record.action as any).cardId.split('-')[1];
                      const cardName = CARD_POOL.find(c => c.id === baseId)?.name || 'a card';
                      return `Played ${cardName}`;
                    })()}
                    {record.action.type === 'ATTACK_CARD' && (() => {
                      const attackerBaseId = record.action.attackerId.split('-')[1];
                      const attackerName = CARD_POOL.find(c => c.id === attackerBaseId)?.name || 'Unit';
                      return `Attacked with ${attackerName}`;
                    })()}
                    {record.action.type === 'ATTACK_PLAYER' && `Attacked champion directly!`}
                    {record.action.type === 'USE_ABILITY' && (() => {
                      const baseId = (record.action as any).cardId.split('-')[1];
                      const cardName = CARD_POOL.find(c => c.id === baseId)?.name || 'Unit';
                      return `Used ability: ${cardName}`;
                    })()}
                    {record.action.type === 'END_TURN' && `Ended their turn`}
                    {(record.action.type as string) === 'FATIGUE' && `Took ${(record.action as any).damage} fatigue damage!`}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Opponent Area */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Opponent Info */}
          <div className="flex items-center justify-center">
            <div 
              onClick={handleOpponentPlayerClick}
              data-player-id={opponent?.id}
              className={cn(
                "flex flex-col items-center transition-all",
                (targetMode === 'attack' && opponent?.board.length === 0) || targetMode === 'ability' || (targetMode === 'spell' && selectedCardId && me.hand.find(c => c.id === selectedCardId)?.ability.effect === 'damage_enemy_card_or_champion') ? "cursor-pointer scale-110" : "cursor-default"
              )}
            >
              <div className="relative">
                <div className={cn(
                  "w-20 h-20 bg-red-500/10 rounded-full border-2 flex items-center justify-center overflow-hidden transition-all",
                  (targetMode === 'attack' && opponent?.board.length === 0) || targetMode === 'ability' || (targetMode === 'spell' && selectedCardId && me.hand.find(c => c.id === selectedCardId)?.ability.effect === 'damage_enemy_card_or_champion')
                    ? "border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse" 
                    : "border-red-500/30"
                )}>
                  <img 
                    src="/flat.png" 
                    alt="Enemy Champion Portrait" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                      const icon = document.createElement('div');
                      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user text-red-500/50"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
                      target.parentElement?.appendChild(icon.firstChild!);
                    }}
                  />
                </div>
                {/* Health Bar */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-24 h-4 bg-black/60 rounded-full border border-white/10 p-0.5 overflow-hidden shadow-xl">
                  <div 
                    className="h-full bg-gradient-to-r from-red-600 to-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${(opponent?.hp || 0) / 20 * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black">{opponent?.hp}/20</span>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/30 mt-6">Enemy Champion ({opponent?.name || 'Opponent'})</span>
            </div>
          </div>

          {/* Opponent Board */}
          <div 
            onClick={handleOpponentPlayerClick}
            className={cn(
              "flex-1 flex items-center justify-center gap-6 rounded-3xl border-2 border-dashed transition-all",
              (targetMode === 'attack' && opponent?.board.length === 0) || (targetMode === 'spell' && selectedCardId && ['damage_enemy_card', 'damage_enemy_card_or_champion', 'buff_jesper_v2', 'debuff_enemy_attack', 'debuff_card_stats', 'banish_unit', 'mark_vulnerable'].includes(me.hand.find(c => c.id === selectedCardId)?.ability.effect || '')) ? "border-red-500/20 bg-red-500/5 cursor-crosshair" : "border-white/5"
            )}
          >
            <AnimatePresence mode="popLayout">
              {opponent?.board.map((card: Card) => (
                <CardView 
                  key={card.id} 
                  card={card} 
                  onClick={() => handleCardClick(card, 'opponentBoard')}
                  isTarget={targetMode === 'attack' || targetMode === 'ability' || (targetMode === 'spell' && selectedCardId && ['damage_enemy_card', 'damage_enemy_card_or_champion', 'buff_jesper_v2', 'debuff_enemy_attack', 'debuff_card_stats', 'banish_unit', 'mark_vulnerable'].includes(me.hand.find(c => c.id === selectedCardId)?.ability.effect || ''))}
                  lastAction={gameState.lastAction}
                  myBoard={me.board}
                  opponentBoard={opponent?.board}
                />
              ))}
            </AnimatePresence>
            {opponent?.board.length === 0 && (
              <div className="text-white/5 flex flex-col items-center gap-2">
                <Skull className="w-12 h-12" />
                <span className="text-xs font-bold uppercase tracking-widest">Empty Board</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2" />

        {/* Player Area */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Player Board */}
          <div 
            ref={boardRef}
            className={cn(
              "flex-1 flex items-center justify-center gap-6 rounded-3xl border-2 border-dashed transition-all",
              targetMode === 'spell' && selectedCardId && ['buff_card_stats', 'buff_jesper_v2', 'buff_friendly_attack', 'prevent_death'].includes(me.hand.find(c => c.id === selectedCardId)?.ability.effect || '') ? "border-emerald-500/20 bg-emerald-500/5 cursor-crosshair" : "border-white/5"
            )}
          >
            <AnimatePresence mode="popLayout">
              {me.board.map((card: Card) => (
                <CardView 
                  key={card.id} 
                  card={card} 
                  isSelected={selectedCardId === card.id}
                  onClick={() => handleCardClick(card, 'board')}
                  onAbility={() => handleUseAbility(card)}
                  canUseAbility={
                    isMyTurn && 
                    me.mana >= getAbilityCost(card) && 
                    !card.hasUsedAbility &&
                    ((card.ability.effect !== 'borrow_enemy_unit' && card.ability.effect !== 'summon_token') || me.board.length < 4) &&
                    (card.ability.effect !== 'summon_token_enemy_board' || (opponent && opponent.board.length < 4))
                  }
                  isMyCard
                  lastAction={gameState.lastAction}
                  actualAbilityCost={getAbilityCost(card)}
                  isTarget={targetMode === 'spell' && selectedCardId && ['buff_card_stats', 'buff_jesper_v2', 'buff_friendly_attack', 'prevent_death'].includes(me.hand.find(c => c.id === selectedCardId)?.ability.effect || '')}
                  myBoard={me.board}
                  opponentBoard={opponent?.board}
                  isPulsing={!!pulsingCardIds[card.id] && Date.now() - pulsingCardIds[card.id] < 1000}
                />
              ))}
            </AnimatePresence>
            {me.board.length < 4 && (
              <div className="w-32 h-44 border-2 border-dashed border-white/5 rounded-2xl flex items-center justify-center">
                <Plus className="w-6 h-6 text-white/10" />
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex items-center justify-center">
            <div 
              onClick={handleMyPlayerClick}
              data-player-id={myId}
              className={cn(
                "flex flex-col items-center transition-all",
                targetMode === 'ability' ? "cursor-pointer scale-110" : "cursor-default"
              )}
            >
              <div className="relative">
                <div className={cn(
                  "w-20 h-20 bg-emerald-500/10 rounded-full border-2 flex items-center justify-center overflow-hidden transition-all",
                  targetMode === 'ability'
                    ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-pulse"
                    : "border-emerald-500/30"
                )}>
                  <img 
                    src="/soyjak (1).png" 
                    alt="Player Portrait" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                      const icon = document.createElement('div');
                      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user text-emerald-500/50"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
                      target.parentElement?.appendChild(icon.firstChild!);
                    }}
                  />
                </div>
                {/* Health Bar */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-24 h-4 bg-black/60 rounded-full border border-white/10 p-0.5 overflow-hidden shadow-xl">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${me.hp / 20 * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black">{me.hp}/20</span>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/30 mt-6">Friendly Champion ({me.name || 'You'})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hand */}
      <div className="h-56 bg-[#151619] border-t border-white/10 p-4 flex items-center justify-center gap-4 z-50">
        <AnimatePresence>
          {me.hand.map((card) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, x: 300, y: 100, scale: 0.2, rotate: 45 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              whileHover={{ y: -20, scale: 1.05 }}
              whileDrag={{ scale: 1.1, zIndex: 100 }}
              drag={isMyTurn && me.mana >= card.manaCost && (me.board.length < 4 || card.category === 'spell')}
              dragSnapToOrigin
              onDragEnd={(e, info) => handleDragEnd(e, info, card)}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="relative cursor-grab active:cursor-grabbing"
            >
              <CardView 
                card={card} 
                onClick={() => handleCardClick(card, 'hand')}
                disabled={!isMyTurn || me.mana < card.manaCost || (card.category !== 'spell' && me.board.length >= 4) || (card.category === 'spell' && isCursedDomainActive)}
                isMyCard
                lastAction={gameState.lastAction}
                actualAbilityCost={getAbilityCost(card)}
                yoshiStoryActive={gameState.yoshiStoryTurns > 0}
                serverLagActive={isServerLagActive}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {me.hand.length === 0 && (
          <p className="text-white/10 text-sm font-bold uppercase tracking-widest">No cards in hand</p>
        )}
      </div>

      {/* Mulligan Overlay */}
      {gameState.status === 'mulligan' && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl w-full flex flex-col items-center gap-12"
          >
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black italic tracking-tighter">MULLIGAN PHASE</h2>
              <p className="text-white/40 uppercase tracking-[0.4em] text-[10px] font-bold">
                Select cards to replace • {gameState.timer}s remaining
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-6">
              {me.hand.map((card) => (
                <div 
                  key={card.id}
                  onClick={() => handleCardClick(card, 'hand')}
                  className="relative group cursor-pointer"
                >
                  <CardView 
                    card={card} 
                    isMyCard
                    isSelected={selectedMulliganIds.includes(card.id)}
                  />
                  {selectedMulliganIds.includes(card.id) && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute inset-0 bg-red-500/20 border-4 border-red-500 rounded-2xl flex items-center justify-center backdrop-blur-[2px]"
                    >
                      <Trash2 className="w-12 h-12 text-red-500 drop-shadow-lg" />
                    </motion.div>
                  )}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">
                      {selectedMulliganIds.includes(card.id) ? "Will be replaced" : "Click to replace"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => {
                sendAction({ type: 'MULLIGAN', cardIds: selectedMulliganIds });
                setSelectedMulliganIds([]);
              }}
              disabled={gameState.mulliganConfirmed[myId]}
              className={cn(
                "px-12 py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all text-sm",
                gameState.mulliganConfirmed[myId]
                  ? "bg-white/5 text-white/20 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.2)]"
              )}
            >
              {gameState.mulliganConfirmed[myId] ? "Waiting for enemy champion..." : "Confirm Selection"}
            </button>
          </motion.div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState.status === 'finished' && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-md w-full bg-[#151619] border border-white/10 rounded-3xl p-12 text-center shadow-2xl"
          >
            <div className="flex justify-center mb-6">
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center border-4",
                gameState.winner === myId ? "bg-emerald-500/20 border-emerald-500/50" : "bg-red-500/20 border-red-500/50"
              )}>
                {gameState.winner === myId ? <Trophy className="w-12 h-12 text-emerald-500" /> : <Skull className="w-12 h-12 text-red-500" />}
              </div>
            </div>
            <h2 className="text-4xl font-black mb-2 tracking-tighter italic">
              {gameState.winner === myId ? "VICTORY" : "DEFEAT"}
            </h2>
            <p className="text-white/50 mb-8 uppercase tracking-widest text-xs font-bold">
              {gameState.winner === myId ? "You have conquered the Aether" : "Your soul has been consumed"}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-white/90 transition-all uppercase tracking-widest"
            >
              Play Again
            </button>
          </motion.div>
        </div>
        )}
        {explosions.map(explosion => (
          <motion.div
            key={explosion.id}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'fixed',
              left: explosion.x - 25,
              top: explosion.y - 25,
              width: 50,
              height: 50,
              backgroundColor: 'orange',
              borderRadius: '50%',
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          />
        ))}
        {kebabAnimations.map(kebab => (
          <motion.img
            key={kebab.id}
            src="/Kebab_detail-217912472.png"
            initial={{ x: kebab.startX, y: kebab.startY, scale: 0.5 }}
            animate={{ x: kebab.endX, y: kebab.endY, scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'fixed',
              width: 50,
              height: 50,
              zIndex: 1000,
              pointerEvents: 'none'
            }}
            referrerPolicy="no-referrer"
          />
        ))}
        {bkCrownAnimations.map(crown => (
          <motion.img
            key={crown.id}
            src="/BK-Crown.png"
            initial={{ x: crown.startX, y: crown.startY, scale: 0.6, rotate: 0 }}
            animate={{ x: crown.endX, y: crown.endY, scale: 2.0, rotate: 720 }}
            transition={{ duration: 4, ease: "easeInOut" }}
            style={{
              position: 'fixed',
              width: 200,
              height: 200,
              zIndex: 1000,
              pointerEvents: 'none',
              marginLeft: -100,
              marginTop: -100
            }}
            referrerPolicy="no-referrer"
          />
        ))}
        {urgeAnimations.map(urge => (
          <motion.img
            key={urge.id}
            src="/urge_no_bg_clean.png"
            initial={{ x: urge.startX, y: urge.startY, opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], scale: 2.0 }}
            transition={{ duration: 1.5 }}
            style={{
              position: 'fixed',
              width: 200,
              height: 200,
              zIndex: 1000,
              pointerEvents: 'none',
              marginLeft: -100,
              marginTop: -100
            }}
            referrerPolicy="no-referrer"
          />
        ))}
        {jizzAnimations.map(jizz => (
          <motion.div
            key={jizz.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center"
          >
            <div className="relative w-full h-full">
              {/* Drips - Concentrated in absolute middle */}
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ y: -100, x: `${48 + Math.random() * 4}%`, height: 0 }}
                  animate={{ 
                    y: [null, Math.random() * 400 + 300],
                    height: [0, Math.random() * 300 + 150, 0]
                  }}
                  transition={{ 
                    duration: Math.random() * 8 + 5,
                    ease: "easeIn",
                    delay: Math.random() * 3
                  }}
                  style={{
                    position: 'absolute',
                    width: Math.random() * 30 + 15,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '0 0 30px 30px',
                    boxShadow: '0 0 20px rgba(255,255,255,0.6)'
                  }}
                />
              ))}
              {/* Splats - Larger and more central */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={`splat-${i}`}
                  initial={{ scale: 0, x: `${48 + Math.random() * 4}%`, y: `${48 + Math.random() * 4}%`, opacity: 0 }}
                  animate={{ scale: [0, 2.5, 2.0], opacity: [0, 1, 0] }}
                  transition={{ duration: 6, delay: Math.random() * 4 }}
                  style={{
                    position: 'absolute',
                    width: Math.random() * 150 + 100,
                    height: Math.random() * 150 + 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    borderRadius: '50%',
                    filter: 'blur(8px)',
                    boxShadow: '0 0 30px rgba(255,255,255,0.5)'
                  }}
                />
              ))}
            </div>
          </motion.div>
        ))}
        {fireballAnimations.map(fire => (
          <motion.div
            key={fire.id}
            initial={{ 
              x: fire.startX - 15, 
              y: fire.startY - 15, 
              scale: 0,
              opacity: 0 
            }}
            animate={{ 
              x: [fire.startX - 15, fire.startX - 15, fire.endX - 15],
              y: [fire.startY - 15, fire.startY - 15, fire.endY - 15],
              scale: [0, 1.5, 1],
              opacity: [0, 1, 1]
            }}
            transition={{ 
              duration: 1.5,
              times: [0, 0.2, 1],
              delay: fire.delay,
              ease: "easeIn"
            }}
            style={{
              position: 'fixed',
              width: 30,
              height: 30,
              background: 'radial-gradient(circle, #ff4d00 0%, #ff9900 60%, transparent 100%)',
              borderRadius: '50%',
              boxShadow: '0 0 20px #ff4d00, 0 0 40px #ff9900',
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          >
            <div className="absolute inset-0 bg-white/40 rounded-full animate-pulse" />
            <div className="absolute -inset-2 border-2 border-orange-500/30 rounded-full animate-ping" />
          </motion.div>
        ))}
        {charmAnimations.map(charm => (
          <motion.div
            key={charm.id}
            initial={{ x: charm.x - 20, y: charm.y - 20, scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.5, 0.5], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2, times: [0, 0.2, 0.8, 1] }}
            style={{
              position: 'fixed',
              width: 40,
              height: 40,
              fontSize: 40,
              zIndex: 1000,
              pointerEvents: 'none',
              color: 'pink'
            }}
          >
            ❤️
          </motion.div>
        ))}
      </div>
  );
}

function DeckStack({ count, maxCount, label }: { count: number; maxCount: number; label: string }) {
  const stackSize = Math.ceil((count / maxCount) * 4);
  
  return (
    <div className="group relative flex flex-col items-center">
      <div className="relative w-16 h-24">
        {Array.from({ length: stackSize }).map((_, i) => (
          <div 
            key={i}
            className="absolute inset-0 rounded-lg border border-white/20 bg-[#1c1d21] shadow-xl transition-all"
            style={{ 
              transform: `translateY(-${i * 3}px) translateX(${i * 1}px)`,
              zIndex: i,
              backgroundImage: 'linear-gradient(135deg, #1c1d21 0%, #0a0a0a 100%)',
            }}
          >
            {i === stackSize - 1 && (
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <Swords className="w-8 h-8" />
              </div>
            )}
          </div>
        ))}
        {stackSize === 0 && (
          <div className="absolute inset-0 rounded-lg border border-dashed border-white/5 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white/10 uppercase tracking-widest">Empty</span>
          </div>
        )}
      </div>
      
      {/* Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded text-[8px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
        {label}: {count} Cards
      </div>
    </div>
  );
}

function DeckBuilder({ onBack, savedDecks, initialDeckIndex, onSave, deckNames, onSaveNames }: { 
  onBack: () => void; 
  savedDecks: Card[][]; 
  initialDeckIndex: number; 
  onSave: (decks: Card[][], index: number) => void;
  deckNames: string[];
  onSaveNames: (names: string[]) => void;
}) {
  const [decks, setDecks] = useState<Card[][]>(savedDecks);
  const [names, setNames] = useState<string[]>(deckNames);
  const [activeSlot, setActiveSlot] = useState(initialDeckIndex);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'monster' | 'spell'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'mana-asc' | 'mana-desc'>('mana-asc');
  const [copySuccess, setCopySuccess] = useState(false);

  const deck = decks[activeSlot];

  const setDeck = (newDeck: Card[]) => {
    const newDecks = [...decks];
    newDecks[activeSlot] = newDeck;
    setDecks(newDecks);
  };

  const filteredCards = CARD_POOL.filter(card => {
    const matchesSearch = card.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || card.category === filter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortBy === 'mana-asc') return a.manaCost - b.manaCost;
    if (sortBy === 'mana-desc') return b.manaCost - a.manaCost;
    return a.name.localeCompare(b.name);
  });

  const addToDeck = (card: Card) => {
    if (deck.length >= 20) return;
    
    const count = deck.filter(c => c.id === card.id).length;
    const isLegendary = card.name.includes('(Legendary)');
    
    if (isLegendary && count >= 1) return;
    if (!isLegendary && count >= 2) return;
    
    setDeck([...deck, { ...card }]);
  };

  const removeFromDeck = (cardId: string) => {
    const index = deck.findLastIndex(c => c.id === cardId);
    if (index !== -1) {
      const newDeck = [...deck];
      newDeck.splice(index, 1);
      setDeck(newDeck);
    }
  };

  const handleCopyCode = () => {
    const code = encodeDeck(deck);
    navigator.clipboard.writeText(code);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const clearDeck = () => {
    setDeck([]);
  };

  const groupedDeck = deck.reduce((acc, card) => {
    const existing = acc.find(item => item.card.id === card.id);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ card, count: 1 });
    }
    return acc;
  }, [] as { card: Card; count: number }[]).sort((a, b) => a.card.manaCost - b.card.manaCost || a.card.name.localeCompare(b.card.name));

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white/60 hover:text-white"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="flex items-center gap-3">
            <Layout className="w-5 h-5 text-emerald-500" />
            <span className="font-black tracking-tighter text-lg uppercase">Deck Builder</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/60 px-4 py-1.5 rounded-full border border-white/10">
            <span className={cn(
              "text-xs font-bold",
              deck.length === 20 ? "text-emerald-500" : "text-white/40"
            )}>
              {deck.length}/20 Cards
            </span>
          </div>
          <button 
            onClick={() => {
              onSave(decks, activeSlot);
              onSaveNames(names);
              onBack();
            }}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
          >
            Save & Exit
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost: Deck Slots (Tabs) */}
        <div className="w-16 border-r border-white/5 bg-black/40 flex flex-col items-center py-4 gap-4">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/20 vertical-text mb-2">Slots</span>
          {decks.map((d, i) => (
            <button
              key={i}
              onClick={() => setActiveSlot(i)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all border",
                activeSlot === i 
                  ? "bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                  : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Left: Current Deck */}
        <div className="w-80 border-r border-white/5 bg-black/20 flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            {isEditingName ? (
              <input
                autoFocus
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                onBlur={() => {
                  if (editingNameValue.trim()) {
                    const newNames = [...names];
                    newNames[activeSlot] = editingNameValue.trim();
                    setNames(newNames);
                  }
                  setIsEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingNameValue.trim()) {
                      const newNames = [...names];
                      newNames[activeSlot] = editingNameValue.trim();
                      setNames(newNames);
                    }
                    setIsEditingName(false);
                  }
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="bg-white/5 border border-emerald-500/50 rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white focus:outline-none w-40"
              />
            ) : (
              <h3 
                className="group text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white cursor-pointer transition-colors flex items-center gap-2"
                onClick={() => {
                  setEditingNameValue(names[activeSlot]);
                  setIsEditingName(true);
                }}
              >
                {names[activeSlot]}
                <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
            )}
            <div className="flex gap-2">
              <button 
                onClick={handleCopyCode}
                disabled={deck.length === 0}
                className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-20"
                title="Copy Deck Code"
              >
                {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={clearDeck}
                disabled={deck.length === 0}
                className="p-1.5 rounded bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all disabled:opacity-20"
                title="Clear Deck"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {groupedDeck.map(({ card, count }) => {
              const isLegendary = card.name.includes('(Legendary)');
              return (
                <motion.div 
                  key={card.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className={cn(
                    "group flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer",
                    isLegendary 
                      ? "bg-orange-500/10 border-orange-500/50 hover:bg-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.2)]" 
                      : "bg-black border-white/5 hover:border-white/20"
                  )}
                  onClick={() => removeFromDeck(card.id)}
                >
                  <div className="relative w-7 h-7 flex items-center justify-center">
                    <Gem className={cn(
                      "w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]",
                      isLegendary ? "text-orange-400 fill-orange-600" : "text-blue-400 fill-blue-600"
                    )} />
                    <span className={cn(
                      "absolute text-[10px] font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] z-10",
                      isLegendary ? "text-black" : "text-white"
                    )}>
                      {card.manaCost}
                    </span>
                  </div>
                  <span 
                    className={cn(
                      "flex-1 text-[10px] font-bold uppercase tracking-wider truncate",
                      isLegendary ? "text-orange-400" : "text-white/80"
                    )}
                    title={card.name}
                  >
                    {card.name}
                  </span>
                  {count > 1 && (
                    <span className="text-[10px] font-black text-emerald-500 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                      x{count}
                    </span>
                  )}
                  <X className="w-3 h-3 text-white/20 group-hover:text-red-400 transition-colors" />
                </motion.div>
              );
            })}
            {deck.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <Plus className="w-8 h-8 mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Add cards from the right</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Card Collection */}
        <div className="flex-1 flex flex-col bg-black/40">
          {/* Filters */}
          <div className="p-4 border-b border-white/5 flex items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text"
                placeholder="Search cards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
              {(['all', 'monster', 'spell'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    filter === t ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                if (sortBy === 'mana-asc') setSortBy('mana-desc');
                else if (sortBy === 'mana-desc') setSortBy('name');
                else setSortBy('mana-asc');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                Sort: {sortBy === 'name' ? 'Name' : sortBy === 'mana-asc' ? 'Mana (Low)' : 'Mana (High)'}
              </span>
            </button>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
              {filteredCards.map(card => {
                const countInDeck = deck.filter(c => c.id === card.id).length;
                const isLegendary = card.name.includes('(Legendary)');
                const isMaxed = (isLegendary && countInDeck >= 1) || (!isLegendary && countInDeck >= 2);
                
                return (
                  <div key={card.id} className="relative group">
                    <div 
                      className={cn(
                        "transition-all",
                        isMaxed ? "opacity-40 grayscale pointer-events-none" : "hover:scale-105 active:scale-95"
                      )}
                      onClick={() => addToDeck(card)}
                    >
                      <CardView card={card} disabled={isMaxed} />
                    </div>
                    {countInDeck > 0 && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-black shadow-lg z-30">
                        {countInDeck}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function SmokeFieldOverlay() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden"
    >
      <motion.div 
        animate={{ opacity: [0.1, 0.25, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 bg-zinc-800/30 mix-blend-multiply" 
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const size = 500 + Math.random() * 600;
        const startX = 10 + Math.random() * 80; // More centered horizontally
        const startY = 20 + Math.random() * 60; // More centered vertically
        const duration = 20 + Math.random() * 15;
        const delay = Math.random() * -20; // Random start point in animation

        return (
          <motion.div
            key={i}
            className="absolute bg-zinc-600/20 rounded-full blur-[120px]"
            style={{
              width: size,
              height: size,
              left: `${startX}%`,
              top: `${startY}%`,
            }}
            animate={{
              x: [-150, 150],
              y: [-50, 50],
              opacity: [0, 0.5, 0],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: delay
            }}
          />
        );
      })}
    </motion.div>
  );
}

function CardView({ 
  card, 
  onClick, 
  isSelected, 
  onAbility, 
  canUseAbility, 
  disabled,
  isTarget,
  isMyCard,
  lastAction,
  actualAbilityCost,
  yoshiStoryActive,
  serverLagActive,
  myBoard,
  opponentBoard,
  isPulsing
}: { 
  card: Card; 
  onClick?: () => void; 
  isSelected?: boolean;
  onAbility?: () => void;
  canUseAbility?: boolean;
  disabled?: boolean;
  isTarget?: boolean;
  isMyCard?: boolean;
  lastAction?: GameState['lastAction'];
  actualAbilityCost?: number;
  yoshiStoryActive?: boolean;
  serverLagActive?: boolean;
  myBoard?: Card[];
  opponentBoard?: Card[];
  key?: string | number;
  isPulsing?: boolean;
}) {
  const isAttacker = lastAction?.action.type === 'ATTACK_CARD' && lastAction.action.attackerId === card.id;
  const isPlayerAttacker = lastAction?.action.type === 'ATTACK_PLAYER' && lastAction.action.attackerId === card.id;
  const isTargeted = lastAction?.action.type === 'ATTACK_CARD' && lastAction.action.targetId === card.id;
  const isAbilityUser = lastAction?.action.type === 'USE_ABILITY' && lastAction.action.cardId === card.id;
  const isLilljesperAbility = isAbilityUser && card.name === 'Lilljesper';
  const isLegendary = card.name.includes('(Legendary)');

  const displayAbilityCost = actualAbilityCost !== undefined ? actualAbilityCost : card.ability.manaCost;

  // Calculate attack animation offset
  const getAttackOffset = () => {
    if (!lastAction || (!isAttacker && !isPlayerAttacker)) return { x: 0, y: 0 };
    
    const attackerBoard = isMyCard ? myBoard : opponentBoard;
    const targetBoard = isMyCard ? opponentBoard : myBoard;
    
    if (!attackerBoard || !targetBoard) return { x: 0, y: 0 };

    const attackerIndex = attackerBoard.findIndex(c => c.id === card.id);
    if (attackerIndex === -1) return { x: 0, y: 0 };

    const n = attackerBoard.length;
    const attackerX = (attackerIndex - (n - 1) / 2) * 152;

    let targetX = 0;
    let targetY = isMyCard ? -250 : 250;

    if (isAttacker && lastAction.action.type === 'ATTACK_CARD') {
      const targetId = lastAction.action.targetId;
      const targetIndex = targetBoard.findIndex(c => c.id === targetId);
      if (targetIndex !== -1) {
        const m = targetBoard.length;
        targetX = (targetIndex - (m - 1) / 2) * 152;
      }
    } else if (isPlayerAttacker) {
      targetY = isMyCard ? -400 : 400;
    }

    return { x: targetX - attackerX, y: targetY };
  };

  const offset = getAttackOffset();

  return (
    <motion.div 
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: isPulsing ? 1.2 : (isSelected ? 1.05 : 1), 
        opacity: 1,
        y: isAttacker || isPlayerAttacker ? [0, offset.y, 0] : 0,
        x: isAttacker || isPlayerAttacker ? [0, offset.x, 0] : 0,
      }}
      exit={{ 
        scale: 0.5, 
        opacity: 0, 
        filter: 'brightness(2) blur(10px)',
        transition: { 
          duration: 0.4,
          delay: (isAttacker || isPlayerAttacker || isTargeted) ? 1.2 : 0
        }
      }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        y: {
          type: "tween",
          duration: 0.3,
          times: [0, 0.3, 1],
          ease: ["easeOut", "easeIn"]
        },
        x: {
          type: "tween",
          duration: 0.3,
          times: [0, 0.3, 1],
          ease: ["easeOut", "easeIn"]
        }
      }}
      key={isAttacker || isPlayerAttacker ? lastAction?.timestamp : undefined}
      onClick={disabled ? undefined : onClick}
      data-card-id={card.id}
      title={card.name}
      className={cn(
        "relative w-32 h-44 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden flex flex-col group",
        isSelected ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "border-white/10 bg-[#1c1d21]",
        isLegendary && !isSelected && "border-4 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.6)]",
        card.category === 'spell' && !isSelected && "border-4 border-blue-500 bg-blue-900/10",
        disabled ? "opacity-40 grayscale cursor-not-allowed" : "hover:border-white/40 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]",
        isTarget && !isMyCard && "border-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]",
        card.hasAttacked && isMyCard && !isSelected && "opacity-70",
        isTargeted && "ring-4 ring-red-500 ring-offset-4 ring-offset-black"
      )}
    >
      {/* Lilljesper Flash Overlay */}
      {isLilljesperAbility && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, times: [0, 0.2, 1] }}
          className="absolute inset-0 bg-red-600 z-[60] pointer-events-none"
        />
      )}

      {/* Protected Shield Visual */}
      {card.isProtected && (
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center"
        >
          {/* Glowing effect around the whole card */}
          <div className="absolute inset-0 border-4 border-white rounded-2xl shadow-[0_0_25px_rgba(255,255,255,0.9)]" />
          {/* Shield in the middle */}
          <Shield className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,1)] z-10" />
        </motion.div>
      )}

      {/* Card Header */}
      <div className="p-2 flex justify-between items-start bg-black/20 relative h-12">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[8px] font-black uppercase tracking-tighter text-white/40 leading-none">{card.type}</span>
            {card.category === 'spell' && (
              <span className="text-[6px] font-black uppercase tracking-widest bg-blue-600 px-1 rounded-sm text-white">Spell</span>
            )}
          </div>
          <span 
            className={cn(
              "text-[10px] font-bold leading-tight truncate pr-1",
              isLegendary ? "text-orange-400" : "text-white"
            )}
            title={card.name}
          >
            {card.name}
          </span>
        </div>
        <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
          <Gem className={cn(
            "w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]",
            isLegendary ? "text-orange-400 fill-orange-600" : "text-blue-400 fill-blue-600"
          )} />
          <span className={cn(
            "absolute text-[11px] font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] z-10",
            isLegendary ? "text-black" : "text-white"
          )}>
            {card.manaCost}
          </span>
        </div>
      </div>

      {/* Card Image */}
      <div className="flex-1 bg-black/40 flex items-center justify-center relative">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="w-8 h-8 text-white/5" />
          </div>
        )}

        {/* Yoshi's Story Indicator */}
        {yoshiStoryActive && card.category === 'monster' && (
          <div className="absolute top-1 left-1 z-30">
            <div className="bg-pink-500 rounded-full p-0.5 shadow-lg animate-bounce">
              <RefreshCw className="w-3 h-3 text-white" />
            </div>
          </div>
        )}

        {/* Server Lag Indicator */}
        {serverLagActive && isMyCard && (
          <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[1px] z-20 flex items-center justify-center pointer-events-none">
            <WifiOff className="w-8 h-8 text-red-500 animate-pulse" />
          </div>
        )}

        {/* Vulnerable Indicator */}
        {card.isVulnerable && (
          <div className="absolute top-1 right-1 z-30">
            <div className="bg-red-600 rounded-full p-0.5 shadow-lg animate-pulse">
              <Target className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
        
        {/* Ability/Passive Overlay (Always show on hover if not disabled) */}
        <div className={cn(
          "absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center",
          (disabled || (serverLagActive && isMyCard)) && "hidden"
        )}>
          {card.passive ? (
            <>
              <Shield className="w-4 h-4 mb-1 text-emerald-400" />
              <span className="text-[8px] font-bold uppercase tracking-widest mb-0.5 text-emerald-400">{card.passive.name}</span>
              <span className="text-[7px] text-white/60 leading-tight">{card.passive.description}</span>
              <div className="mt-2 px-2 py-0.5 bg-emerald-900/40 border border-emerald-500/30 rounded text-[7px] font-bold text-emerald-400 uppercase tracking-widest">
                Passive Ability
              </div>
            </>
          ) : (
            <>
              {card.category === 'spell' ? (
                <Flame className="w-4 h-4 mb-1 text-orange-500" />
              ) : (
                <Zap className={cn("w-4 h-4 mb-1", (canUseAbility || !onAbility) ? "text-yellow-400" : "text-white/20")} />
              )}
              <span className="text-[8px] font-bold uppercase tracking-widest mb-0.5">{card.ability.name}</span>
              <span className="text-[7px] text-white/60 leading-tight">{card.ability.description}</span>
              
              {onAbility ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); onAbility(); }}
                  disabled={!canUseAbility || serverLagActive}
                  className={cn(
                    "mt-2 px-2 py-0.5 rounded text-[7px] font-bold transition-colors",
                    (canUseAbility && !serverLagActive) ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-white/10 text-white/20 cursor-not-allowed"
                  )}
                >
                  USE: {displayAbilityCost} MANA
                </button>
              ) : (
                <div className="mt-2 px-2 py-0.5 bg-white/5 rounded text-[7px] font-bold text-white/40">
                  COST: {displayAbilityCost} MANA
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Bubbles */}
      {card.category === 'monster' && (
        <>
          <div className="absolute -bottom-1 -left-1 w-14 h-11 flex items-center justify-center z-20">
            <div className="relative w-full h-full flex items-center justify-center">
              <Sword className="w-full h-full text-gray-300 fill-gray-800 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] -rotate-45" />
              <span className={cn(
                "absolute text-sm font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] z-10",
                card.attack > card.baseAttack ? "text-blue-400" : card.attack < card.baseAttack ? "text-yellow-400" : "text-white"
              )}>
                {card.attack}
              </span>
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-11 h-11 flex items-center justify-center z-20">
            <div className="relative w-full h-full flex items-center justify-center">
              <Droplet className="w-full h-full text-red-500 fill-red-700 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
              <span className={cn(
                "absolute text-sm font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] z-10 pt-1",
                card.hp > card.baseHp ? "text-blue-400" : card.hp < card.baseHp ? "text-yellow-400" : "text-white"
              )}>
                {card.hp}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Status Indicators */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-12 pointer-events-none flex flex-col gap-1 z-40">
        {isMyCard && card.hasAttacked && (
          <div className="px-2 py-0.5 border border-white/20 bg-black/40 backdrop-blur-sm rounded text-[8px] font-bold text-white/40 uppercase tracking-widest">Exhausted</div>
        )}
        {card.isDeathPrevented && (
          <div className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-900/60 backdrop-blur-sm rounded text-[8px] font-bold text-emerald-400 uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.4)]">Immortal</div>
        )}
      </div>
    </motion.div>
  );
}
