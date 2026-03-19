export type CardType = 'early' | 'mid' | 'late';

export interface Card {
  id: string;
  name: string;
  manaCost: number;
  attack: number;
  hp: number;
  maxHp: number;
  baseAttack: number;
  baseHp: number;
  auraAttack: number;
  auraHp: number;
  type: CardType;
  category: 'monster' | 'spell';
  imageUrl?: string;
    ability: {
      name: string;
      description: string;
      manaCost: number;
      effect: 'damage_enemy_player' | 'damage_enemy_card' | 'heal_self_card' | 'heal_player' | 'buff_card_stats' | 'debuff_enemy_attack' | 'buff_friendly_attack' | 'heal_all_friendly_cards' | 'draw_cards' | 'buff_self_stats' | 'heal_target_card' | 'heal_friendly_target' | 'heal_friendly_random_range' | 'prevent_opponent_buffs' | 'consume_friendly_card' | 'heal_target_random_range' | 'summon_token' | 'borrow_enemy_unit' | 'gain_mana' | 'suicide_bomb' | 'summon_token_enemy_board' | 'buff_self_attack' | 'swap_all_stats' | 'add_cards_to_opponent_hand' | 'protect_friendly_card' | 'buff_all_friendly_except_self' | 'switch_stats' | 'steal_card' | 'vegan_diet' | 'introvert_gain_mana' | 'buff_all_friendly_attack' | 'copy_unit_to_hand' | 'prevent_death' | 'debuff_card_stats' | 'resurrect_random' | 'banish_unit' | 'buff_jesper' | 'buff_jim' | 'discard_all' | 'mark_vulnerable' | 'gain_mana_per_unit' | 'heal_all_friendly_full' | 'switch_hp_mana' | 'damage_all_enemies' | 'banish_all' | 'silence_opponent' | 'fjewsion' | 'damage_enemy_card_or_champion' | 'damage_2_random_enemies_3_dmg' | 'reduce_spell_cost_hand' | 'buff_jesper_v2' | 'heal_all_friendly_and_champion' | 'silence_opponent_v2' | 'add_random_spells_to_hand' | 'draw_spell_from_deck' | 'buff_unit_attack' | 'damage_enemy_champion_v2' | 'reduce_ability_cost_temp' | 'none';
      value: number;
      value2?: number;
    };
    passive?: {
      name: string;
      description: string;
      effect: 'aura_buff_stats' | 'end_turn_heal_player' | 'end_turn_damage_enemy_player' | 'end_turn_heal_self' | 'end_turn_damage_random_enemy_card' | 'on_ally_death_buff_self' | 'aura_conditional_atk' | 'scout' | 'egg_timer' | 'start_turn_damage_owner_player' | 'start_turn_damage_random_enemy_card' | 'start_turn_damage_random_enemy_card_or_champion' | 'attack_again_on_kill' | 'on_spell_cast_damage_random_enemy' | 'exhaust_after_attack' | 'smoke_field' | 'cursed_domain' | 'reduce_ability_cost' | 'infatuate_aura' | 'negative_aura';
      value: number;
      value2?: number;
    };
  hasAttacked: boolean;
  hasUsedAbility: boolean;
  turnsRemaining?: number;
  isBorrowed?: boolean;
  isExhausted?: boolean;
  isProtected?: boolean;
  isDeathPrevented?: boolean;
  isVulnerable?: boolean;
  isBanned?: boolean;
  isTemporary?: boolean;
  tempAttack?: number;
  originalOwnerId?: string;
  sounds: {
    play?: string;
    attack?: string;
    death?: string;
    ability?: string;
  };
}

export interface PlayerState {
  id: string;
  name: string;
  hp: number;
  mana: number;
  maxMana: number;
  deck: Card[];
  hand: Card[];
  board: Card[];
  graveyard: Card[];
  fatigue: number;
  preventBuffs?: boolean;
}

export interface GameState {
  roomId: string;
  players: { [id: string]: PlayerState };
  turn: string; // Player ID
  turnNumber: number;
  status: 'waiting' | 'mulligan' | 'playing' | 'finished';
  mulliganConfirmed: { [id: string]: boolean };
  winner?: string;
  timer: number;
  isAI: boolean;
  yoshiStoryTurns: number;
  yoshiSwapped: boolean;
  serverLag: { [playerId: string]: number };
  lastAction?: {
    playerId: string;
    action: GameAction;
    timestamp: number;
  };
  history: {
    playerId: string;
    action: GameAction;
    timestamp: number;
  }[];
  animations: { id: string; type: 'explosion' | 'kebab' | 'urge' | 'jizzsperm' | 'bk-crown' | 'charm' | 'fireball'; targetId?: string; sourceId?: string; }[];
}

export type GameAction =
  | { type: 'JOIN_ROOM'; roomId: string; playerName: string; isAI?: boolean; deck?: Card[] }
  | { type: 'PLAY_CARD'; cardId: string; targetId?: string }
  | { type: 'ATTACK_CARD'; attackerId: string; targetId: string }
  | { type: 'ATTACK_PLAYER'; attackerId: string }
  | { type: 'USE_ABILITY'; cardId: string; targetId?: string; targetType?: 'player' | 'card' }
  | { type: 'MULLIGAN'; cardIds: string[] }
  | { type: 'END_TURN' };

export interface ServerMessage {
  type: 'STATE_UPDATE';
  state: GameState;
  yourId: string;
}

export interface ClientMessage {
  action: GameAction;
}
