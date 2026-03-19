import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GameState, GameAction, PlayerState, Card } from './src/types.js';
import { generateRandomDeck, EGG_TOKEN, BOMB_TOKEN, BARRY_TOKEN, CARD_POOL, COIN_CARD } from './src/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map<string, GameState>();
const clients = new Map<WebSocket, { roomId: string; playerId: string }>();
const intervals = new Map<string, NodeJS.Timeout>();

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function hasPassive(state: GameState, effect: string): boolean {
  return Object.values(state.players).some((p: PlayerState) => 
    p.board.some(c => c.passive?.effect === effect)
  );
}

function broadcastState(roomId: string) {
  const state = rooms.get(roomId);
  if (!state) return;

  wss.clients.forEach((client) => {
    const clientInfo = clients.get(client as WebSocket);
    if (clientInfo && clientInfo.roomId === roomId) {
      client.send(JSON.stringify({
        type: 'STATE_UPDATE',
        state,
        yourId: clientInfo.playerId
      }));
    }
  });
}

function startMulliganTimer(roomId: string) {
  if (intervals.has(roomId)) {
    clearInterval(intervals.get(roomId)!);
  }

  const interval = setInterval(() => {
    const state = rooms.get(roomId);
    if (!state || state.status !== 'mulligan') {
      clearInterval(interval);
      intervals.delete(roomId);
      return;
    }

    state.timer -= 1;
    if (state.timer <= 0) {
      console.log(`Mulligan timer expired for room ${roomId}. Auto-confirming all.`);
      // Auto-confirm mulligan for everyone who hasn't
      Object.keys(state.players).forEach(pid => {
        if (!state.mulliganConfirmed[pid]) {
          handleAction(pid, { type: 'MULLIGAN', cardIds: [] }, state);
        }
      });
      
      // Force start if still in mulligan for some reason
      if (state.status === 'mulligan') {
        console.log(`Forcing game start for room ${roomId} after timer expiry`);
        state.status = 'playing';
        state.timer = 60;
        
        const firstPlayerId = state.turn;
        const secondPlayerId = Object.keys(state.players).find(id => id !== firstPlayerId)!;
        const firstPlayer = state.players[firstPlayerId];
        const secondPlayer = state.players[secondPlayerId];
        
        firstPlayer.maxMana = 1;
        firstPlayer.mana = 1;
        secondPlayer.maxMana = 0;
        secondPlayer.mana = 0;
        if (!secondPlayer.hand.some(c => c.name === 'The Coin')) {
          secondPlayer.hand.push({ ...COIN_CARD, id: `coin-${Date.now()}-${Math.random()}` });
        }
        
        startGameTimer(roomId);
      }
    }
    broadcastState(roomId);
  }, 1000);

  intervals.set(roomId, interval);
}

function startGameTimer(roomId: string) {
  if (intervals.has(roomId)) {
    clearInterval(intervals.get(roomId)!);
  }

  const interval = setInterval(() => {
    const state = rooms.get(roomId);
    if (!state || state.status !== 'playing') {
      clearInterval(interval);
      intervals.delete(roomId);
      return;
    }

    state.timer -= 1;
    if (state.timer <= 0) {
      handleAction(state.turn, { type: 'END_TURN' }, state);
    }
    broadcastState(roomId);
  }, 1000);

  intervals.set(roomId, interval);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runAILogic(roomId: string) {
  const state = rooms.get(roomId);
  if (!state || state.status !== 'playing' || !state.isAI) return;

  const aiId = Object.keys(state.players).find(id => id.startsWith('ai-'));
  if (!aiId || state.turn !== aiId) return;

  // AI thinking time
  await sleep(1500);

  // Re-check state after sleep
  const currentState = rooms.get(roomId);
  if (!currentState || currentState.turn !== aiId || currentState.status !== 'playing') return;

  const aiPlayer = currentState.players[aiId];
  const opponentId = Object.keys(currentState.players).find(id => id !== aiId)!;
  const opponent = currentState.players[opponentId];

  // 1. Play cards
  let playedThisTurn = true;
  while (playedThisTurn) {
    playedThisTurn = false;
    const currentAiState = rooms.get(roomId);
    if (!currentAiState) break;
    const currentAiPlayer = currentAiState.players[aiId];
    const currentOpponent = currentAiState.players[opponentId];

    const playableCards = [...currentAiPlayer.hand].filter(c => c.manaCost <= currentAiPlayer.mana);
    for (const card of playableCards) {
      if ((card.category === 'spell' || currentAiPlayer.board.length < 4) && currentAiPlayer.mana >= card.manaCost) {
        let targetId: string | undefined = undefined;
        const effect = card.ability.effect;
        
        if (card.category === 'spell') {
          const enemyTargets = ['damage_enemy_card', 'debuff_enemy_attack', 'debuff_card_stats', 'banish_unit', 'mark_vulnerable'];
          const friendlyTargets = ['buff_card_stats', 'buff_friendly_attack', 'prevent_death'];
          
          if (enemyTargets.includes(effect)) {
            if (currentOpponent.board.length > 0) {
              targetId = currentOpponent.board[0].id;
            } else if (effect === 'damage_enemy_card' || effect === 'banish_unit') {
              continue; // Skip targeted removal if no targets
            }
          } else if (friendlyTargets.includes(effect)) {
            if (currentAiPlayer.board.length > 0) {
              targetId = currentAiPlayer.board[0].id;
            } else {
              continue; // Skip buffs if no friendly units
            }
          }
        }

        handleAction(aiId, { type: 'PLAY_CARD', cardId: card.id, targetId }, currentAiState);
        broadcastState(roomId);
        playedThisTurn = true;
        await sleep(1200);
        break; // Re-scan hand after playing a card
      }
    }
  }

  // 2. Use abilities
  for (const card of [...aiPlayer.board]) {
    if (!card.hasUsedAbility && aiPlayer.mana >= card.ability.manaCost) {
      if (card.ability.effect === 'damage_enemy_card' && opponent.board.length > 0) {
        handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id, targetId: opponent.board[0].id, targetType: 'card' }, currentState);
        broadcastState(roomId);
        await sleep(1200);
      } else if (card.ability.effect === 'damage_enemy_player' || card.ability.effect === 'heal_player' || card.ability.effect === 'heal_self_card' || card.ability.effect === 'buff_card_stats' || card.ability.effect === 'buff_friendly_attack' || card.ability.effect === 'heal_all_friendly_cards' || card.ability.effect === 'draw_cards' || card.ability.effect === 'buff_self_stats' || card.ability.effect === 'prevent_opponent_buffs' || card.ability.effect === 'summon_token' || card.ability.effect === 'gain_mana' || card.ability.effect === 'suicide_bomb' || card.ability.effect === 'summon_token_enemy_board' || card.ability.effect === 'buff_self_attack' || card.ability.effect === 'damage_2_random_enemies_3_dmg') {
        handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id }, currentState);
        broadcastState(roomId);
        await sleep(1200);
      } else if (card.ability.effect === 'borrow_enemy_unit' && opponent.board.length > 0) {
        handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id, targetId: opponent.board[0].id, targetType: 'card' }, currentState);
        broadcastState(roomId);
        await sleep(1200);
      } else if (card.ability.effect === 'consume_friendly_card') {
        // AI eats the weakest other friendly minion
        const otherMinions = aiPlayer.board.filter(c => c.id !== card.id);
        if (otherMinions.length > 0) {
          const weakest = otherMinions.sort((a, b) => (a.attack + a.hp) - (b.attack + b.hp))[0];
          handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id, targetId: weakest.id, targetType: 'card' }, currentState);
          broadcastState(roomId);
          await sleep(1200);
        }
      } else if (card.ability.effect === 'heal_target_random_range' || card.ability.effect === 'heal_target_card') {
        // AI heals itself or friendly card
        const target = aiPlayer.board.find(c => c.hp < c.maxHp) || aiPlayer.board[0];
        if (target) {
          handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id, targetId: target.id, targetType: 'card' }, currentState);
          broadcastState(roomId);
          await sleep(1200);
        }
      } else if (card.ability.effect === 'debuff_enemy_attack' && opponent.board.length > 0) {
        handleAction(aiId, { type: 'USE_ABILITY', cardId: card.id, targetId: opponent.board[0].id, targetType: 'card' }, currentState);
        broadcastState(roomId);
        await sleep(1200);
      }
    }
  }

  // 3. Attack
  for (const card of [...aiPlayer.board]) {
    if (!card.hasAttacked) {
      if (opponent.board.length > 0) {
        handleAction(aiId, { type: 'ATTACK_CARD', attackerId: card.id, targetId: opponent.board[0].id }, currentState);
      } else {
        handleAction(aiId, { type: 'ATTACK_PLAYER', attackerId: card.id }, currentState);
      }
      broadcastState(roomId);
      await sleep(1200);
    }
  }

  // 4. End Turn
  await sleep(1000);
  handleAction(aiId, { type: 'END_TURN' }, currentState);
  broadcastState(roomId);
}

function handleCardDeath(state: GameState, deadCard: Card, ownerId: string) {
  const owner = state.players[ownerId];
  owner.board = owner.board.filter(c => c.id !== deadCard.id);
  
  if (!deadCard.isBanned) {
    owner.graveyard.push(deadCard);
  }

  // Trigger on_ally_death passives
  owner.board.forEach(card => {
    if (card.passive?.effect === 'on_ally_death_buff_self') {
      card.baseAttack += card.passive.value;
      card.baseHp += card.passive.value2 || 0;
      card.hp += card.passive.value2 || 0;
      card.maxHp += card.passive.value2 || 0;
    }
  });
}

function damageCard(state: GameState, card: Card, amount: number, ownerId: string) {
  if (card.isProtected && amount > 0) {
    card.isProtected = false;
    return;
  }
  
  let actualDamage = amount;
  if (card.isVulnerable) {
    actualDamage *= 2;
  }

  card.hp -= actualDamage;
  
  if (card.isDeathPrevented && card.hp < 1) {
    card.hp = 1;
  }

  if (card.hp <= 0) {
    handleCardDeath(state, card, ownerId);
  }
}

function damagePlayer(state: GameState, playerId: string, amount: number) {
  const player = state.players[playerId];
  const opponentId = Object.keys(state.players).find(id => id !== playerId);
  
  if (!player) return;

  player.hp -= amount;
  
  if (player.hp <= 0 && opponentId) {
    state.status = 'finished';
    state.winner = opponentId;
  }
}

function syncAuras(state: GameState) {
  Object.values(state.players).forEach((player: PlayerState) => {
    player.board.forEach(card => {
      card.auraAttack = 0;
      card.auraHp = 0;
    });
  });

  Object.values(state.players).forEach((player: PlayerState) => {
    // If server lag is active for this player, skip their passives
    if (state.serverLag[player.id] > 0) return;

    player.board.forEach(sourceCard => {
      if (sourceCard.passive?.effect === 'aura_buff_stats') {
        player.board.forEach(targetCard => {
          if (sourceCard.id !== targetCard.id) {
            targetCard.auraAttack += sourceCard.passive!.value;
            targetCard.auraHp += sourceCard.passive!.value2 || 0;
          }
        });
      } else if (sourceCard.passive?.effect === 'aura_conditional_atk') {
        const conditionNames = ['Lilljesper', 'Jeper', 'Depressed Jesper (Legendary)', 'Jesper'];
        const isConditionMet = Object.values(state.players).some((p: PlayerState) => 
          p.board.some(c => conditionNames.some(name => c.name.includes(name)))
        );
        if (isConditionMet) {
          sourceCard.auraAttack += sourceCard.passive!.value;
        }
      } else if (sourceCard.passive?.effect === 'infatuate_aura') {
        const opponentId = Object.keys(state.players).find(id => id !== player.id);
        if (opponentId) {
          const opponent = state.players[opponentId];
          opponent.board.forEach(targetCard => {
            targetCard.auraAttack -= sourceCard.passive!.value;
            targetCard.auraHp -= sourceCard.passive!.value;
          });
        }
      } else if (sourceCard.passive?.effect === 'negative_aura') {
        const opponentId = Object.keys(state.players).find(id => id !== player.id);
        if (opponentId) {
          const opponent = state.players[opponentId];
          opponent.board.forEach(targetCard => {
            targetCard.auraAttack -= sourceCard.passive!.value;
          });
        }
      }
    });
  });

  // Apply auras to stats
  Object.values(state.players).forEach((player: PlayerState) => {
    player.board.forEach(card => {
      card.attack = Math.max(0, card.baseAttack + card.auraAttack + (card.tempAttack || 0));
      card.maxHp = Math.max(1, card.baseHp + card.auraHp);
      if (card.hp > card.maxHp) {
        card.hp = card.maxHp;
      }
    });
  });
}

function processStartTurnPassives(state: GameState, activePlayerId: string) {
  const player = state.players[activePlayerId];
  const opponentId = Object.keys(state.players).find(id => id !== activePlayerId);
  
  const cardsToDestroy: string[] = [];
  
  player.board.forEach(card => {
    // Reset death prevention at start of turn
    card.isDeathPrevented = false;

    if (!card.passive) return;
    const { effect, value } = card.passive;
    
    if (effect === 'start_turn_damage_owner_player') {
      damagePlayer(state, activePlayerId, value);
    } else if (effect === 'start_turn_damage_random_enemy_card' && opponentId) {
      const opponent = state.players[opponentId];
      if (opponent.board.length > 0) {
        const target = opponent.board[Math.floor(Math.random() * opponent.board.length)];
        state.animations.push({ id: `crown-${Date.now()}-${Math.random()}`, type: 'bk-crown', sourceId: card.id, targetId: target.id });
        damageCard(state, target, value, opponentId);
      }
    } else if (effect === 'start_turn_damage_random_enemy_card_or_champion' && opponentId) {
      const opponent = state.players[opponentId];
      const possibleTargets = [...opponent.board.map(c => ({ type: 'card' as const, id: c.id })), { type: 'player' as const, id: opponentId }];
      const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
      
      if (target.type === 'card') {
        const targetCard = opponent.board.find(c => c.id === target.id);
        if (targetCard) {
          state.animations.push({ id: `crown-${Date.now()}-${Math.random()}`, type: 'bk-crown', sourceId: card.id, targetId: target.id });
          damageCard(state, targetCard, value, opponentId);
        }
      } else {
        state.animations.push({ id: `crown-${Date.now()}-${Math.random()}`, type: 'bk-crown', sourceId: card.id, targetId: opponentId });
        damagePlayer(state, opponentId, value);
      }
    } else if (effect === 'egg_timer') {
      if (card.turnsRemaining !== undefined) {
        card.turnsRemaining--;
        if (card.turnsRemaining <= 0) {
          // Transform into JEWTWO
          const jewtwoTemplate = CARD_POOL.find(c => c.name.includes('Jewtwo'));
          if (jewtwoTemplate) {
            const index = player.board.findIndex(c => c.id === card.id);
            if (index !== -1) {
              const jewtwo = {
                ...jewtwoTemplate,
                id: `transformed-${Date.now()}-${Math.random()}`,
                hasAttacked: false, // Can attack on the turn it appears if it's start of turn
                hasUsedAbility: false
              };
              player.board[index] = jewtwo;
            }
          }
        }
      }
    }

    if (card.isExhausted) {
      card.hasAttacked = true;
      card.isExhausted = false;
    }
  });

  cardsToDestroy.forEach(id => {
    const card = player.board.find(c => c.id === id);
    if (card) {
      handleCardDeath(state, card, activePlayerId);
    }
  });
}

function processEndTurnPassives(state: GameState, activePlayerId: string) {
  const player = state.players[activePlayerId];
  const opponentId = Object.keys(state.players).find(id => id !== activePlayerId);
  const opponent = opponentId ? state.players[opponentId] : null;

  // Return borrowed units
  const borrowedCards = player.board.filter(c => c.isBorrowed);
  borrowedCards.forEach(card => {
    const index = player.board.findIndex(c => c.id === card.id);
    if (index !== -1) {
      player.board.splice(index, 1);
      if (opponent && opponent.board.length < 4) {
        card.isBorrowed = false;
        opponent.board.push(card);
      } else {
        opponent?.graveyard.push(card);
      }
    }
  });

  // Remove temporary units (like those from Jim's Livbåt)
  const temporaryCards = player.board.filter(c => c.isTemporary);
  temporaryCards.forEach(card => {
    handleCardDeath(state, card, activePlayerId);
  });
  
  // Also remove temporary cards from hand if they weren't played
  player.hand = player.hand.filter(c => !c.isTemporary);

  player.board.forEach(card => {
    if (!card.passive) return;

    const { effect, value } = card.passive;

    if (effect === 'end_turn_heal_player') {
      player.hp = Math.min(20, player.hp + value);
    } else if (effect === 'end_turn_damage_enemy_player' && opponent) {
      damagePlayer(state, opponentId!, value);
    } else if (effect === 'end_turn_heal_self') {
      card.hp = Math.min(card.maxHp, card.hp + value);
    } else if (effect === 'end_turn_damage_random_enemy_card' && opponent && opponent.board.length > 0) {
      const target = opponent.board[Math.floor(Math.random() * opponent.board.length)];
      damageCard(state, target, value, opponentId!);
    }
  });

  player.board.forEach(card => {
    card.tempAttack = 0;
  });

  player.preventBuffs = false;
  if (state.serverLag[activePlayerId] > 0) {
    state.serverLag[activePlayerId]--;
  }
  syncAuras(state);
}

function swapStatsForYoshi(state: GameState) {
  Object.values(state.players).forEach((player: PlayerState) => {
    [...player.hand, ...player.board, ...player.deck].forEach(card => {
      const oldMana = card.manaCost;
      const oldMaxHp = card.baseHp;
      
      card.manaCost = oldMaxHp;
      card.baseHp = oldMana;
      card.maxHp = oldMana;
      card.hp = oldMana; // Reset HP to new max for simplicity
    });
  });
  state.yoshiSwapped = !state.yoshiSwapped;
}

function handleAction(playerId: string, action: GameAction, state: GameState): GameState {
  // Clear animations at the start of each action
  state.animations = [];

  const player = state.players[playerId];
  const opponentId = Object.keys(state.players).find(id => id !== playerId);
  const opponent = opponentId ? state.players[opponentId] : null;

  if (state.status === 'waiting' && action.type !== 'JOIN_ROOM') {
    return state;
  }

  if (state.turn !== playerId && action.type !== 'JOIN_ROOM' && action.type !== 'MULLIGAN') {
    return state;
  }

  // Record action
  const actionRecord = { playerId, action, timestamp: Date.now() };
  state.lastAction = actionRecord;
  state.history.push(actionRecord);
  if (state.history.length > 20) state.history.shift();

  switch (action.type) {
    case 'JOIN_ROOM': {
      // Handled in wss.on('connection')
      break;
    }
    case 'PLAY_CARD': {
      const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
      if (cardIndex === -1) return state;
      const card = player.hand[cardIndex];

      if (card.category === 'spell' && hasPassive(state, 'cursed_domain')) {
        return state;
      }

      if (player.mana >= card.manaCost) {
        if (card.category === 'spell') {
          player.mana -= card.manaCost;
          player.hand.splice(cardIndex, 1);
          
          // Trigger spell effect immediately
          const { effect, value, value2 } = card.ability;
          if (effect === 'damage_enemy_player' && opponent) {
            damagePlayer(state, opponentId!, value);
          } else if (effect === 'damage_enemy_card' && opponent) {
            const target = opponent.board.find(c => c.id === action.targetId) || opponent.board[0];
            if (target) {
              damageCard(state, target, value, opponentId!);
            }
          } else if (effect === 'damage_enemy_card_or_champion' && opponent && action.targetId) {
            const targetCard = opponent.board.find(c => c.id === action.targetId);
            if (targetCard) {
              damageCard(state, targetCard, value, opponentId!);
            } else if (action.targetId === opponentId) {
              damagePlayer(state, opponentId!, value);
            }
          } else if (effect === 'heal_player') {
            player.hp = Math.min(20, player.hp + value);
          } else if (effect === 'buff_card_stats') {
            const target = player.board.find(c => c.id === action.targetId) || player.board[0];
            if (target) {
              target.baseAttack += value;
              target.baseHp += value;
              target.hp += value;
              target.maxHp += value;
            }
          } else if (effect === 'debuff_enemy_attack' && opponent) {
            const target = opponent.board.find(c => c.id === action.targetId) || opponent.board[0];
            if (target) {
              target.baseAttack = Math.max(0, target.baseAttack - value);
            }
          } else if (effect === 'buff_friendly_attack') {
            const target = player.board.find(c => c.id === action.targetId) || player.board[0];
            if (target) {
              target.baseAttack += value;
            }
          } else if (effect === 'heal_all_friendly_cards') {
            player.board.forEach(c => {
              c.hp = c.maxHp;
            });
          } else if (effect === 'draw_cards') {
            for (let i = 0; i < value; i++) {
              if (player.deck.length > 0) {
                const drawnCard = player.deck.pop()!;
                if (player.hand.length < 7) {
                  player.hand.push(drawnCard);
                } else {
                  player.graveyard.push(drawnCard);
                }
              } else {
                player.fatigue += 1;
                damagePlayer(state, playerId, player.fatigue);
              }
            }
          } else if (effect === 'gain_mana') {
            player.mana += value;
          } else if (effect === 'prevent_death') {
            const target = player.board.find(c => c.id === action.targetId) || player.board[0];
            if (target) {
              target.isDeathPrevented = true;
            }
          } else if (effect === 'debuff_card_stats' && opponent) {
            const target = opponent.board.find(c => c.id === action.targetId) || opponent.board[0];
            if (target) {
              target.baseAttack = Math.max(0, target.baseAttack - value);
              target.baseHp = Math.max(1, target.baseHp - value);
              target.hp = Math.max(1, target.hp - value);
              target.maxHp = Math.max(1, target.maxHp - value);
              state.animations.push({ id: `charm-${Date.now()}-${Math.random()}`, type: 'charm', targetId: target.id });
            }
          } else if (effect === 'resurrect_random') {
            if (player.graveyard.length > 0) {
              const randomIndex = Math.floor(Math.random() * player.graveyard.length);
              const resurrected = player.graveyard.splice(randomIndex, 1)[0];
              if (player.board.length < 4 && resurrected.category === 'monster') {
                player.board.push({ ...resurrected, hp: resurrected.maxHp, hasAttacked: true });
              } else if (player.hand.length < 7) {
                player.hand.push(resurrected);
              }
            }
          } else if (effect === 'banish_unit' && opponent) {
            const target = opponent.board.find(c => c.id === action.targetId) || opponent.board[0];
            if (target) {
              target.isBanned = true;
              handleCardDeath(state, target, opponentId!);
            }
          } else if (effect === 'buff_jesper_v2') {
            const target = player.board.find(c => c.id === action.targetId) || opponent?.board.find(c => c.id === action.targetId);
            if (target) {
              const isJesper = target.name.includes('Jesper') || target.name.includes('Jeper');
              const buffValue = isJesper ? value2 || 3 : value;
              target.baseAttack += buffValue;
              target.baseHp += buffValue;
              target.hp += buffValue;
              target.maxHp += buffValue;
            }
          } else if (effect === 'heal_all_friendly_and_champion') {
            player.hp = Math.min(20, player.hp + value);
            player.board.forEach(c => {
              c.hp = Math.min(c.maxHp, c.hp + value);
            });
          } else if (effect === 'reduce_ability_cost_temp') {
            player.board.forEach(c => {
              c.ability.manaCost = Math.max(0, c.ability.manaCost - value);
            });
          } else if (effect === 'discard_all') {
            player.graveyard.push(...player.hand);
            player.hand = [];
            if (opponent) {
              opponent.graveyard.push(...opponent.hand);
              opponent.hand = [];
            }
          } else if (effect === 'mark_vulnerable' && opponent) {
            const target = opponent.board.find(c => c.id === action.targetId) || opponent.board[0];
            if (target) {
              target.isVulnerable = true;
            }
          } else if (effect === 'gain_mana_per_unit') {
            const totalUnits = player.board.length + (opponent?.board.length || 0);
            player.mana += totalUnits * value;
          } else if (effect === 'heal_all_friendly_full') {
            player.board.forEach(c => {
              c.hp = c.maxHp;
            });
          } else if (effect === 'switch_hp_mana') {
            state.yoshiStoryTurns = value;
            if (!state.yoshiSwapped) {
              swapStatsForYoshi(state);
            }
          } else if (effect === 'damage_all_enemies' && opponent) {
            state.animations.push({ id: `jizz-${Date.now()}-${Math.random()}`, type: 'jizzsperm' });
            damagePlayer(state, opponentId!, value);
            opponent.board.forEach(c => damageCard(state, c, value, opponentId!));
          } else if (effect === 'buff_jim') {
            player.board.forEach(c => {
              if (c.name.toLowerCase().includes('jim')) {
                c.baseAttack += value;
                c.baseHp += value;
                c.hp += value;
                c.maxHp += value;
              }
            });
          } else if (effect === 'banish_all') {
            [...player.board].forEach(c => {
              c.isBanned = true;
              handleCardDeath(state, c, playerId);
            });
            if (opponent) {
              [...opponent.board].forEach(c => {
                c.isBanned = true;
                handleCardDeath(state, c, opponentId!);
              });
            }
          } else if (effect === 'silence_opponent' && opponentId) {
            state.serverLag[opponentId] = value;
          } else if (effect === 'silence_opponent_v2' && opponentId) {
            state.serverLag[opponentId] = value;
            const opponent = state.players[opponentId];
            opponent.board.forEach(c => damageCard(state, c, 1, opponentId));
          } else if (effect === 'buff_unit_attack') {
            const target = player.board.find(c => c.id === action.targetId) || player.board[0];
            if (target) {
              target.tempAttack = (target.tempAttack || 0) + value;
            }
          } else if (effect === 'damage_enemy_champion_v2' && opponentId) {
            damagePlayer(state, opponentId, value);
          } else if (effect === 'damage_2_random_enemies_3_dmg' && opponent) {
            const targets = opponent.board.filter(c => c.hp > 0);
            for (let i = 0; i < 2; i++) {
              if (targets.length > 0) {
                const randomIndex = Math.floor(Math.random() * targets.length);
                const target = targets.splice(randomIndex, 1)[0];
                damageCard(state, target, value, opponentId!);
              }
            }
          } else if (effect === 'fjewsion') {
            const jonte = player.board.find(c => c.name === 'Jonte');
            const eggbert = player.board.find(c => c.name === 'Eggbert');
            if (jonte && eggbert) {
              handleCardDeath(state, jonte, playerId);
              handleCardDeath(state, eggbert, playerId);
              
              const jewtwoTemplate = CARD_POOL.find(c => c.id === 'c11');
              if (jewtwoTemplate) {
                const jewtwo = { 
                  ...jewtwoTemplate, 
                  id: `jewtwo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  hasAttacked: true,
                  hasUsedAbility: false
                };
                if (player.board.length < 4) {
                  player.board.push(jewtwo);
                }
              }
            }
          }
          
          // Trigger on_spell_cast_damage_random_enemy passives (after spell effect)
          player.board.forEach(pCard => {
            if (pCard.passive?.effect === 'on_spell_cast_damage_random_enemy' && opponentId) {
              const opponent = state.players[opponentId];
              const damage = pCard.passive.value;
              const times = pCard.passive.value2 || 1;
              for (let i = 0; i < times; i++) {
                // Re-fetch possible targets each time to avoid hitting dead units
                const possibleTargets = [...opponent.board.map(c => ({ type: 'card' as const, id: c.id })), { type: 'player' as const, id: opponentId }];
                const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
                
                // Add fireball animation
                state.animations.push({ 
                  id: `fire-${Date.now()}-${Math.random()}`, 
                  type: 'fireball', 
                  sourceId: pCard.id, 
                  targetId: target.id 
                });

                if (target.type === 'card') {
                  const targetCard = opponent.board.find(c => c.id === target.id);
                  if (targetCard) damageCard(state, targetCard, damage, opponentId);
                } else {
                  damagePlayer(state, opponentId, damage);
                }
              }
            }
          });
          
          player.graveyard.push(card);
          syncAuras(state);
        } else if (player.board.length < 4) {
          player.mana -= card.manaCost;
          player.hand.splice(cardIndex, 1);
          const isScout = card.passive?.effect === 'scout';
          
          player.board.push({ 
            ...card, 
            hasAttacked: !isScout, 
            hp: card.hp, 
            maxHp: card.hp,
            turnsRemaining: card.turnsRemaining
          });
          syncAuras(state);
        }
      }
      break;
    }

    case 'ATTACK_CARD': {
      let attacker = player.board.find(c => c.id === action.attackerId);
      let target = opponent?.board.find(c => c.id === action.targetId);

      if (attacker && target && !attacker.hasAttacked && attacker.hp > 0 && target.hp > 0) {
        if (hasPassive(state, 'smoke_field') && Math.random() < 0.5) {
          const allPossibleTargets: ({ type: 'card'; card: Card; ownerId: string } | { type: 'player'; playerId: string })[] = [
            ...(opponent?.board.map(c => ({ type: 'card' as const, card: c, ownerId: opponentId! })) || []),
            ...(player.board.filter(c => c.id !== attacker?.id).map(c => ({ type: 'card' as const, card: c, ownerId: playerId } )) || []),
            { type: 'player', playerId: playerId },
            { type: 'player', playerId: opponentId! }
          ];
          
          const randomTarget = allPossibleTargets[Math.floor(Math.random() * allPossibleTargets.length)];
          if (randomTarget.type === 'card') {
            target = randomTarget.card;
            const targetOwnerId = randomTarget.ownerId;
            
            damageCard(state, target, attacker.attack, targetOwnerId);
            damageCard(state, attacker, target.attack, playerId);
            attacker.hasAttacked = true;
            syncAuras(state);
            return state;
          } else {
            damagePlayer(state, randomTarget.playerId, attacker.attack);
            attacker.hasAttacked = true;
            syncAuras(state);
            return state;
          }
        }

        damageCard(state, target, attacker.attack, opponentId!);
        const targetDied = target.hp <= 0;
        damageCard(state, attacker, target.attack, playerId);
        attacker.hasAttacked = true;

        if (targetDied && attacker.passive?.effect === 'attack_again_on_kill') {
          attacker.hasAttacked = false;
        }

        if (attacker.name === 'The King') {
          attacker.isExhausted = true;
        }
        syncAuras(state);
      }
      break;
    }

    case 'ATTACK_PLAYER': {
      let attacker = player.board.find(c => c.id === action.attackerId);
      if (attacker && !attacker.hasAttacked && attacker.hp > 0 && opponent) {
        if (hasPassive(state, 'smoke_field') && Math.random() < 0.5) {
          const allPossibleTargets: ({ type: 'card'; card: Card; ownerId: string } | { type: 'player'; playerId: string })[] = [
            ...(opponent.board.map(c => ({ type: 'card' as const, card: c, ownerId: opponentId! }))),
            ...(player.board.filter(c => c.id !== attacker?.id).map(c => ({ type: 'card' as const, card: c, ownerId: playerId }))),
            { type: 'player', playerId: playerId },
            { type: 'player', playerId: opponentId! }
          ];
          
          const randomTarget = allPossibleTargets[Math.floor(Math.random() * allPossibleTargets.length)];
          if (randomTarget.type === 'card') {
            const target = randomTarget.card;
            damageCard(state, target, attacker.attack, randomTarget.ownerId);
            damageCard(state, attacker, target.attack, playerId);
            attacker.hasAttacked = true;
            syncAuras(state);
            return state;
          } else {
            damagePlayer(state, randomTarget.playerId, attacker.attack);
            attacker.hasAttacked = true;
            syncAuras(state);
            return state;
          }
        }

        if (opponent.board.length === 0) {
          damagePlayer(state, opponentId!, attacker.attack);
          attacker.hasAttacked = true;
          if (attacker.name === 'The King') {
            attacker.isExhausted = true;
          }
        }
      }
      break;
    }

    case 'USE_ABILITY': {
      // Check for server lag
      if (state.serverLag[playerId] > 0) return state;

      const card = player.board.find(c => c.id === action.cardId);
      if (!card || card.hasUsedAbility || card.hp <= 0) return state;

      let abilityCost = card.ability.manaCost;
      if (player.board.some(c => c.passive?.effect === 'reduce_ability_cost')) {
        abilityCost = Math.max(0, abilityCost - 1);
      }

      if (player.mana < abilityCost) return state;

      player.mana -= abilityCost;
      card.hasUsedAbility = true;

      const { effect, value } = card.ability as any;

      if (effect === 'damage_enemy_player' && opponent) {
        damagePlayer(state, opponentId!, value);
      } else if (effect === 'damage_enemy_card' && opponent && action.targetId) {
        const target = opponent.board.find(c => c.id === action.targetId);
        if (target && target.hp > 0) {
          damageCard(state, target, value, opponentId!);
        }
      } else if (effect === 'damage_enemy_card_or_champion' && opponent && action.targetId) {
        const targetCard = opponent.board.find(c => c.id === action.targetId);
        if (targetCard && targetCard.hp > 0) {
          damageCard(state, targetCard, value, opponentId!);
        } else if (action.targetId === opponentId) {
          damagePlayer(state, opponentId!, value);
        }
      } else if (effect === 'damage_2_random_enemies_3_dmg' && opponent) {
        const targets = opponent.board.filter(c => c.hp > 0);
        for (let i = 0; i < 2; i++) {
          if (targets.length > 0) {
            const randomIndex = Math.floor(Math.random() * targets.length);
            const target = targets.splice(randomIndex, 1)[0];
            damageCard(state, target, value, opponentId!);
          }
        }
      } else if (effect === 'heal_self_card') {
        card.hp = Math.min(card.maxHp, card.hp + value);
      } else if (effect === 'heal_player') {
        player.hp = Math.min(20, player.hp + value);
      } else if (effect === 'buff_card_stats') {
        if (player.preventBuffs) return state;
        const target = player.board.find(c => c.id === action.targetId) || card;
        if (target) {
          target.baseAttack += value;
          target.baseHp += value;
          target.hp += value;
          target.maxHp += value;
        }
      } else if (effect === 'buff_self_stats') {
        if (player.preventBuffs) return state;
        card.baseAttack += value;
        card.baseHp += value;
        card.hp += value;
        card.maxHp += value;
      } else if (effect === 'heal_friendly_target' && action.targetId) {
        const targetCard = player.board.find(c => c.id === action.targetId);
        if (targetCard) {
          targetCard.hp = Math.min(targetCard.maxHp, targetCard.hp + value);
        } else if (action.targetId === playerId) {
          player.hp = Math.min(20, player.hp + value);
        }
      } else if (effect === 'heal_target_card' && action.targetId) {
        const targetCard = player.board.find(c => c.id === action.targetId) || opponent?.board.find(c => c.id === action.targetId);
        if (targetCard) {
          targetCard.hp = Math.min(targetCard.maxHp, targetCard.hp + value);
        } else if (action.targetId === playerId) {
          player.hp = Math.min(20, player.hp + value);
        } else if (action.targetId === opponentId) {
          if (opponent) opponent.hp = Math.min(20, opponent.hp + value);
        }
      } else if (effect === 'protect_friendly_card' && action.targetId) {
        const target = player.board.find(c => c.id === action.targetId);
        if (target) {
          target.isProtected = true;
        }
      } else if (effect === 'buff_all_friendly_except_self') {
        player.board.forEach(c => {
          if (c.name !== 'Sandy Halime') {
            c.baseAttack += value;
            c.baseHp += value;
            c.hp += value;
            c.maxHp += value;
          }
        });
      } else if (effect === 'prevent_opponent_buffs' && opponent) {
        opponent.preventBuffs = true;
      } else if (effect === 'consume_friendly_card' && action.targetId) {
        const target = player.board.find(c => c.id === action.targetId);
        if (target && target.id !== card.id) {
          card.baseAttack += target.attack;
          card.baseHp += target.hp;
          card.hp += target.hp;
          card.maxHp += target.hp;
          handleCardDeath(state, target, playerId);
        }
      } else if (effect === 'heal_friendly_random_range' && action.targetId) {
        state.animations.push({ id: `kebab-${Date.now()}-${Math.random()}`, type: 'kebab', sourceId: card.id, targetId: action.targetId });
        const targetCard = player.board.find(c => c.id === action.targetId);
        const minHeal = value;
        const maxHeal = (card.ability as any).value2 || value;
        const healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
        
        if (targetCard) {
          targetCard.hp = Math.min(targetCard.maxHp, targetCard.hp + healAmount);
        } else if (action.targetId === playerId) {
          player.hp = Math.min(20, player.hp + healAmount);
        }
      } else if (effect === 'heal_target_random_range' && action.targetId) {
        state.animations.push({ id: `kebab-${Date.now()}-${Math.random()}`, type: 'kebab', sourceId: card.id, targetId: action.targetId });
        const targetCard = player.board.find(c => c.id === action.targetId) || opponent?.board.find(c => c.id === action.targetId);
        const minHeal = value;
        const maxHeal = card.ability.value2 || value;
        const healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;

        if (targetCard) {
          targetCard.hp = Math.min(targetCard.maxHp, targetCard.hp + healAmount);
        } else if (action.targetId === playerId) {
          player.hp = Math.min(20, player.hp + healAmount);
        } else if (action.targetId === opponentId) {
          if (opponent) opponent.hp = Math.min(20, opponent.hp + healAmount);
        }
      } else if (effect === 'summon_token') {
        const tokenToSummon = card.name === 'Megan' ? BARRY_TOKEN : EGG_TOKEN;
        if (player.board.length < 4) {
          const token = { 
            ...tokenToSummon, 
            id: `token-${Date.now()}-${Math.random()}`,
            hasAttacked: true,
            hasUsedAbility: false,
            turnsRemaining: tokenToSummon.turnsRemaining
          };
          player.board.push(token);
        }
      } else if (effect === 'debuff_enemy_attack' && opponent && action.targetId) {
        const target = opponent.board.find(c => c.id === action.targetId);
        if (target) {
          target.baseAttack = Math.max(0, target.baseAttack - value);
        }
      } else if (effect === 'buff_friendly_attack') {
        const target = player.board.find(c => c.id === action.targetId) || card;
        if (target) {
          target.baseAttack += value;
        }
      } else if (effect === 'heal_all_friendly_cards') {
        player.board.forEach(c => {
          c.hp = c.maxHp;
        });
      } else if (effect === 'draw_cards') {
        for (let i = 0; i < value; i++) {
          if (player.deck.length > 0) {
            const drawnCard = player.deck.pop()!;
            if (player.hand.length < 7) {
              player.hand.push(drawnCard);
            } else {
              player.graveyard.push(drawnCard);
            }
          } else {
            player.fatigue += 1;
            damagePlayer(state, playerId, player.fatigue);
          }
        }
      } else if (effect === 'borrow_enemy_unit' && action.targetId && opponent) {
        const targetIndex = opponent.board.findIndex(c => c.id === action.targetId);
        if (targetIndex !== -1 && player.board.length < 4) {
          const target = opponent.board.splice(targetIndex, 1)[0];
          target.hasAttacked = false;
          target.isBorrowed = true;
          target.originalOwnerId = opponentId;
          player.board.push(target);
        }
      } else if (effect === 'gain_mana') {
        player.mana += value;
      } else if (effect === 'reduce_spell_cost_hand') {
        player.hand.forEach(c => {
          if (c.category === 'spell') {
            c.manaCost = Math.max(0, c.manaCost - value);
          }
        });
      } else if (effect === 'add_random_spells_to_hand') {
        const spells = CARD_POOL.filter(c => c.category === 'spell');
        for (let i = 0; i < value; i++) {
          if (player.hand.length < 7) {
            const randomSpell = spells[Math.floor(Math.random() * spells.length)];
            player.hand.push({ ...randomSpell, id: `spell-${Date.now()}-${Math.random()}` });
          }
        }
      } else if (effect === 'draw_spell_from_deck') {
        const spellIndex = player.deck.findIndex(c => c.category === 'spell');
        if (spellIndex !== -1) {
          const spell = player.deck.splice(spellIndex, 1)[0];
          if (player.hand.length < 7) {
            player.hand.push(spell);
          } else {
            player.graveyard.push(spell);
          }
        }
      } else if (effect === 'suicide_bomb') {
        handleCardDeath(state, card, playerId);
        state.animations.push({ id: `exp-${Date.now()}-${Math.random()}`, type: 'explosion', targetId: card.id });
        if (opponent && opponent.board.length > 0) {
          const target = opponent.board[Math.floor(Math.random() * opponent.board.length)];
          handleCardDeath(state, target, opponentId!);
          state.animations.push({ id: `exp-${Date.now()}-${Math.random()}`, type: 'explosion', targetId: target.id });
        }
      } else if (effect === 'summon_token_enemy_board' && opponent) {
        if (opponent.board.length < 4) {
          const token = { 
            ...BOMB_TOKEN, 
            id: `token-${Date.now()}-${Math.random()}`,
            hasAttacked: true,
            hasUsedAbility: false
          };
          opponent.board.push(token);
        }
      } else if (effect === 'buff_self_attack') {
        state.animations.push({ id: `urge-${Date.now()}-${Math.random()}`, type: 'urge', sourceId: card.id, targetId: card.id });
        card.baseAttack += value;
        card.attack += value;
      } else if (effect === 'swap_all_stats') {
        const allCards = [...player.board, ...(opponent ? opponent.board : [])];
        if (allCards.length > 1) {
          const stats = allCards.map(c => ({ attack: c.attack, hp: c.hp, baseAttack: c.baseAttack, baseHp: c.baseHp, maxHp: c.maxHp }));
          const shuffledStats = shuffle(stats);
          allCards.forEach((c, i) => {
            c.attack = shuffledStats[i].attack;
            c.hp = shuffledStats[i].hp;
            c.baseAttack = shuffledStats[i].baseAttack;
            c.baseHp = shuffledStats[i].baseHp;
            c.maxHp = shuffledStats[i].maxHp;
          });
        }
      } else if (effect === 'add_cards_to_opponent_hand' && opponent) {
        const kirinCard = CARD_POOL.find(c => c.name === 'Kirin');
        if (kirinCard) {
          for (let i = 0; i < value; i++) {
            if (opponent.hand.length < 7) {
              opponent.hand.push({ ...kirinCard, id: `kirin-${Date.now()}-${Math.random()}` });
            }
          }
        }
      } else if (effect === 'switch_stats' && action.targetId) {
        const target = player.board.find(c => c.id === action.targetId) || opponent?.board.find(c => c.id === action.targetId);
        if (target) {
          const oldAttack = target.baseAttack;
          target.baseAttack = target.hp;
          target.baseHp = oldAttack;
          target.hp = oldAttack;
          target.maxHp = oldAttack;
        }
      } else if (effect === 'steal_card' && opponent) {
        if (opponent.hand.length > 0 && player.hand.length < 7) {
          const randomIndex = Math.floor(Math.random() * opponent.hand.length);
          const stolenCard = opponent.hand.splice(randomIndex, 1)[0];
          player.hand.push(stolenCard);
        }
      } else if (effect === 'vegan_diet') {
        handleCardDeath(state, card, playerId);
        state.animations.push({ id: `exp-${Date.now()}-${Math.random()}`, type: 'explosion', targetId: card.id });
        if (player.deck.length > 0) {
          const drawn = player.deck.pop()!;
          if (drawn.category === 'monster' && player.board.length < 4) {
            player.board.push({
              ...drawn,
              hasAttacked: true,
              hp: drawn.hp,
              maxHp: drawn.hp
            });
          } else {
            if (player.hand.length < 7) {
              player.hand.push(drawn);
            } else {
              player.graveyard.push(drawn);
            }
          }
        }
      } else if (effect === 'introvert_gain_mana') {
        if (player.board.length === 1) { // Only this card is on the field
          player.mana += value;
        }
      } else if (effect === 'buff_all_friendly_attack') {
        player.board.forEach(c => {
          c.baseAttack += value;
        });
      } else if (effect === 'copy_unit_to_hand' && action.targetId) {
        const target = player.board.find(c => c.id === action.targetId) || opponent?.board.find(c => c.id === action.targetId);
        if (target && player.hand.length < 7) {
          const copy = { ...target, id: `${target.id}-copy-${Date.now()}` };
          player.hand.push(copy);
        }
      }
      syncAuras(state);
      break;
    }

    case 'MULLIGAN': {
      console.log(`Processing MULLIGAN for player ${playerId} in room ${state.roomId}`);
      if (state.status !== 'mulligan' || state.mulliganConfirmed[playerId]) {
        console.log(`MULLIGAN ignored: status=${state.status}, alreadyConfirmed=${state.mulliganConfirmed[playerId]}`);
        return state;
      }

      const toReplace = player.hand.filter(c => action.cardIds.includes(c.id));
      const kept = player.hand.filter(c => !action.cardIds.includes(c.id));

      console.log(`Player ${playerId} replacing ${toReplace.length} cards`);

      // Draw new cards
      const newCards = player.deck.splice(0, toReplace.length);
      player.hand = [...kept, ...newCards];

      // Shuffle replaced cards back into deck
      player.deck = shuffle([...player.deck, ...toReplace]);

      state.mulliganConfirmed[playerId] = true;

      // Check if all players confirmed
      const allConfirmed = Object.keys(state.players).every(pid => state.mulliganConfirmed[pid]);
      console.log(`Mulligan confirmation: ${JSON.stringify(state.mulliganConfirmed)}, allConfirmed=${allConfirmed}`);
      
      if (allConfirmed) {
        console.log(`All players confirmed mulligan in room ${state.roomId}. Starting game.`);
        state.status = 'playing';
        state.timer = 60;
        
        const firstPlayerId = state.turn;
        const secondPlayerId = Object.keys(state.players).find(id => id !== firstPlayerId)!;
        
        const firstPlayer = state.players[firstPlayerId];
        const secondPlayer = state.players[secondPlayerId];
        
        // First player starts with 1 mana
        firstPlayer.maxMana = 1;
        firstPlayer.mana = 1;
        
        // Second player starts with 0 mana and gets a coin
        secondPlayer.maxMana = 0;
        secondPlayer.mana = 0;
        secondPlayer.hand.push({ ...COIN_CARD, id: `coin-${Date.now()}-${Math.random()}` });
        
        // Draw card for first turn
        if (firstPlayer.deck.length > 0) {
          const drawnCard = firstPlayer.deck.pop()!;
          if (firstPlayer.hand.length < 7) {
            firstPlayer.hand.push(drawnCard);
          } else {
            firstPlayer.graveyard.push(drawnCard);
          }
        }
        startGameTimer(state.roomId);
        if (state.isAI && state.turn.startsWith('ai-')) {
          console.log(`AI turn detected at game start, running AI logic`);
          runAILogic(state.roomId);
        }
      }
      break;
    }
    case 'END_TURN': {
      if (opponentId) {
        processEndTurnPassives(state, playerId);
        
        // Remove vulnerability at end of turn
        if (opponent) {
          opponent.board.forEach(c => c.isVulnerable = false);
        }
        player.board.forEach(c => c.isVulnerable = false);

        state.turn = opponentId;
        state.turnNumber++;
        state.timer = 60; // Reset timer
        
        const nextPlayer = state.players[opponentId];
        nextPlayer.maxMana = Math.min(8, nextPlayer.maxMana + 1);
        nextPlayer.mana = nextPlayer.maxMana;

        // Decrement global timers
        if (state.yoshiStoryTurns > 0) {
          state.yoshiStoryTurns--;
          if (state.yoshiStoryTurns === 0 && state.yoshiSwapped) {
            swapStatsForYoshi(state);
          }
        }

        processStartTurnPassives(state, opponentId);
        if (state.status === 'finished') break;

        // Draw card
        if (nextPlayer.deck.length > 0) {
          const drawnCard = nextPlayer.deck.pop()!;
          if (nextPlayer.hand.length < 7) {
            nextPlayer.hand.push(drawnCard);
          } else {
            nextPlayer.graveyard.push(drawnCard);
          }
        } else {
          // Fatigue logic
          nextPlayer.fatigue += 1;
          damagePlayer(state, opponentId, nextPlayer.fatigue);
          
          // Log fatigue in history
          state.history.push({
            playerId: opponentId,
            action: { type: 'FATIGUE' as any, damage: nextPlayer.fatigue } as any,
            timestamp: Date.now()
          });
          if (state.history.length > 20) state.history.shift();
        }

        // Reset board cards
        nextPlayer.board.forEach(c => {
          c.hasAttacked = false;
          c.hasUsedAbility = false;
          c.isProtected = false;
        });

        if (state.isAI && opponentId.startsWith('ai-')) {
          runAILogic(state.roomId);
        }
      }
      break;
    }
  }

  return state;
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${ip}`);
  
  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    const action = data.action as GameAction;

    if (action.type === 'JOIN_ROOM') {
      const { roomId, playerName, isAI, deck: customDeck } = action;
      console.log(`Player ${playerName} joining room ${roomId} (AI: ${isAI})`);
      let state = rooms.get(roomId);

      if (!state) {
        state = {
          roomId,
          players: {},
          turn: '',
          turnNumber: 1,
          status: 'waiting',
          mulliganConfirmed: {},
          timer: 60,
          isAI: !!isAI,
          yoshiStoryTurns: 0,
          yoshiSwapped: false,
          serverLag: {},
          history: [],
          animations: []
        };
        rooms.set(roomId, state);
      }

      const playerId = Math.random().toString(36).substring(7);
      if (Object.keys(state.players).length < 2) {
        const baseDeck = customDeck && customDeck.length === 20 ? customDeck : generateRandomDeck();
        const deck = shuffle(baseDeck.map(c => ({ ...c, id: `${playerId}-${c.id}-${Math.random()}` })));

        state.players[playerId] = {
          id: playerId,
          name: playerName,
          hp: 20,
          mana: 0,
          maxMana: 0,
          deck,
          hand: [],
          board: [],
          graveyard: [],
          fatigue: 0
        };

        clients.set(ws, { roomId, playerId });

        if (isAI && Object.keys(state.players).length === 1) {
          const aiId = `ai-${Math.random().toString(36).substring(7)}`;
          const aiDeck = shuffle(generateRandomDeck().map(c => ({ ...c, id: `${aiId}-${c.id}-${Math.random()}` })));
          
          state.players[aiId] = {
            id: aiId,
            name: 'Aether Bot',
            hp: 20,
            mana: 0,
            maxMana: 0,
            deck: aiDeck,
            hand: [],
            board: [],
            graveyard: [],
            fatigue: 0
          };
        }

        if (Object.keys(state.players).length === 2) {
          console.log(`Mulligan phase starting in room ${roomId}`);
          state.status = 'mulligan';
          const playerIds = Object.keys(state.players);
          state.turn = shuffle(playerIds)[0];
          const opponentId = playerIds.find(id => id !== state.turn)!;

          // First player gets 3 cards
          state.players[state.turn].hand = state.players[state.turn].deck.splice(0, 3);
          // Second player gets 4 cards
          state.players[opponentId].hand = state.players[opponentId].deck.splice(0, 4);

          // Initialize mulligan confirmation status
          state.mulliganConfirmed = {
            [state.turn]: false,
            [opponentId]: false
          };

          state.timer = 10;
          startMulliganTimer(roomId);
          
          // AI auto-mulligans immediately (keeps all cards for now)
          if (opponentId.startsWith('ai-')) {
            setTimeout(() => {
              const aiState = rooms.get(roomId);
              if (aiState && aiState.status === 'mulligan') {
                console.log(`AI ${opponentId} auto-confirming mulligan`);
                const newState = handleAction(opponentId, { type: 'MULLIGAN', cardIds: [] }, aiState);
                rooms.set(roomId, newState);
                broadcastState(roomId);
              }
            }, 1000);
          } else if (state.turn.startsWith('ai-')) {
             setTimeout(() => {
              const aiState = rooms.get(roomId);
              if (aiState && aiState.status === 'mulligan') {
                console.log(`AI ${state.turn} auto-confirming mulligan`);
                const newState = handleAction(state.turn, { type: 'MULLIGAN', cardIds: [] }, aiState);
                rooms.set(roomId, newState);
                broadcastState(roomId);
              }
            }, 1000);
          }
        }

        broadcastState(roomId);
      }
    } else {
      const clientInfo = clients.get(ws);
      if (clientInfo) {
        const state = rooms.get(clientInfo.roomId);
        if (state) {
          const newState = handleAction(clientInfo.playerId, action, state);
          rooms.set(clientInfo.roomId, newState);
          broadcastState(clientInfo.roomId);
        }
      }
    }
  });

  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      // Optional: handle player disconnect
      // rooms.delete(clientInfo.roomId);
      clients.delete(ws);
    }
  });
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware integrated for development');
    } catch (err) {
      console.error('Failed to load Vite server:', err);
    }
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log('Serving static files from:', distPath);
    } else {
      console.error('Production dist folder not found! Build the app first.');
      app.get('*', (req, res) => {
        res.status(500).send('Application not built. Please run "npm run build".');
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
