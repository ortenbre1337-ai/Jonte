import { Card } from './types.js';

const DEFAULT_SOUNDS = {
  play: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  attack: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  death: './oof.mp3',
  ability: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
};

const createCard = (
  id: string,
  name: string,
  manaCost: number,
  attack: number,
  hp: number,
  type: 'early' | 'mid' | 'late',
  ability: Card['ability'],
  imageUrl?: string,
  sounds?: Card['sounds'] | string,
  passive?: Card['passive']
): Card => {
  const processedSounds = typeof sounds === 'string' 
    ? { play: sounds, attack: sounds, death: sounds, ability: sounds } 
    : { ...DEFAULT_SOUNDS, ...sounds };

  return {
    id,
    name,
    manaCost,
    attack,
    hp,
    maxHp: hp,
    baseAttack: attack,
    baseHp: hp,
    auraAttack: 0,
    auraHp: 0,
    tempAttack: 0,
    type,
    category: 'monster',
    ability,
    passive,
    hasAttacked: false,
    hasUsedAbility: false,
    imageUrl: imageUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${name.replace(/\s+/g, '')}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    sounds: processedSounds
  };
};

const createSpell = (
  id: string,
  name: string,
  manaCost: number,
  type: 'early' | 'mid' | 'late',
  ability: Card['ability'],
  imageUrl?: string,
  sounds?: Card['sounds'] | string
): Card => {
  const processedSounds = typeof sounds === 'string' 
    ? { play: sounds, attack: sounds, death: sounds, ability: sounds } 
    : { ...DEFAULT_SOUNDS, ...sounds };

  return {
    id,
    name,
    manaCost,
    attack: 0,
    hp: 0,
    maxHp: 0,
    baseAttack: 0,
    baseHp: 0,
    auraAttack: 0,
    auraHp: 0,
    tempAttack: 0,
    type,
    category: 'spell',
    ability,
    hasAttacked: true, // Spells can't attack
    hasUsedAbility: false,
    imageUrl: imageUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${name.replace(/\s+/g, '')}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    sounds: processedSounds
  };
};

export const EGG_TOKEN = createCard('t1', 'Egg', 1, 1, 1, 'early', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Incubation', description: 'After 2 turns: Turn into JEWTWO', effect: 'egg_timer', value: 2 });
EGG_TOKEN.turnsRemaining = 2;

export const BOMB_TOKEN = createCard('t2', 'Annoying Bomb', 1, 1, 1, 'early', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Explosive', description: 'At the start of your turn, deal 2 damage to your champion', effect: 'start_turn_damage_owner_player', value: 2 });
export const BARRY_TOKEN = createCard('t3', 'Barry', 1, 1, 2, 'early', { name: 'None', description: 'None', manaCost: 0, effect: 'debuff_enemy_attack', value: 1 });
export const KIRIN_CARD = createCard('c_kirin', 'Kirin', 1, 1, 1, 'early', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 });
export const COIN_CARD = createSpell('s_coin', 'Coin', 0, 'early', { name: 'Coin', description: 'Gain 1 mana this turn', manaCost: 0, effect: 'gain_mana', value: 1 });

export const CARD_POOL: Card[] = [
  createCard('c1', 'John Satanist', 3, 2, 2, 'early', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Souleater', description: 'Gain +1/+1 when a friendly unit dies', effect: 'on_ally_death_buff_self', value: 1, value2: 1 }),
  createCard('c2', 'Lilljesper', 1, 1, 2, 'early', { name: 'Rage', description: 'Gain +1/+1 stats', manaCost: 1, effect: 'buff_self_stats', value: 1 }),
  createCard('c3', 'Fonzie', 2, 2, 3, 'early', { name: 'Heal meee', description: 'Heal a friendly unit or champion for 2 HP', manaCost: 1, effect: 'heal_friendly_target', value: 2 }),
  createCard('c4', 'Elodie', 2, 1, 4, 'early', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Anger', description: 'If Lilljesper, Depressed Jesper or Jesper is on the field, gain +2 ATK', effect: 'aura_conditional_atk', value: 2 }),
  createCard('c5', 'Jim', 4, 3, 6, 'mid', { name: 'Veganism', description: 'Enemy champion is prevented from buffing stats next turn', manaCost: 2, effect: 'prevent_opponent_buffs', value: 1 }),
  createCard('c6', '2mas', 3, 3, 3, 'early', { name: 'Consume', description: 'Choose a friendly unit to eat, add their current stats to 2mas', manaCost: 2, effect: 'consume_friendly_card', value: 0 }),
  createCard('c7', 'Eddee (Legendary)', 4, 6, 2, 'mid', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Scout', description: 'You can attack the turn you are summoned', effect: 'scout', value: 0 }),
  createCard('c8', 'Jimcool', 6, 7, 6, 'mid', { name: 'Nää', description: 'Lower the attack of an enemy unit by 3', manaCost: 2, effect: 'debuff_enemy_attack', value: 3 }),
  createCard('c9', 'Dr. Döner', 3, 3, 4, 'early', { name: 'Kebab', description: 'Heal a friendly unit or champion for 3-5 HP', manaCost: 2, effect: 'heal_friendly_random_range', value: 3, value2: 5 } as any),
  createCard('c10', 'Eggbert', 3, 2, 5, 'early', { name: 'Egg', description: 'Summon a 1/1 egg, after 2 turns: Turn into JEWTWO', manaCost: 2, effect: 'summon_token', value: 0 }),
  createCard('c11', 'Jewtwo (Legendary)', 8, 6, 6, 'late', { name: 'Go Go Goyim', description: 'Borrow an enemy unit for your turn, that unit can attack instantly', manaCost: 8, effect: 'borrow_enemy_unit', value: 0 }),
  createCard('c12', 'Jonte', 4, 4, 2, 'mid', { name: 'Kin', description: 'Gain an extra 2 mana this turn', manaCost: 0, effect: 'gain_mana', value: 2 }),
  createCard('c13', 'Hazzabula Mohammed', 5, 5, 5, 'mid', { name: 'Suicide bomb', description: 'Destroy yourself and a random enemy unit', manaCost: 3, effect: 'suicide_bomb', value: 0 }),
  createCard('c14', 'Diako', 6, 4, 7, 'late', { name: 'Annoy', description: 'Summon a 1/1 bomb on the enemy board that deals 2 damage to their champion at the start of their turn', manaCost: 2, effect: 'summon_token_enemy_board', value: 0 }),
  createCard('c15', 'aINMAN', 5, 3, 5, 'mid', { name: 'Drink Urge', description: 'Gain +4 attack', manaCost: 3, effect: 'buff_self_attack', value: 4 }),
  createCard('c16', 'Megan', 2, 2, 3, 'early', { name: 'Summon barry', description: 'Summon a 1/2 Barry', manaCost: 1, effect: 'summon_token', value: 0 }),
  createCard('c17', 'Barry', 1, 1, 2, 'early', { name: 'Bark', description: 'Lower attack of an enemy unit by 1', manaCost: 0, effect: 'debuff_enemy_attack', value: 1 }),
  createCard('c18', 'Burger king (Legendary)', 7, 7, 7, 'mid', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Royal Decree', description: 'Deal 4 damage to a random enemy unit or champion at the start of your turn. Becomes exhausted for 1 turn after attacking.', effect: 'start_turn_damage_random_enemy_card_or_champion', value: 4 }),
  createCard('c19', '???', 8, 7, 7, 'late', { name: 'Do nothing', description: 'Literally does nothing', manaCost: 8, effect: 'none', value: 0 }),
  createCard('c20', 'Wakono', 4, 4, 4, 'mid', { name: 'Chaos', description: 'Randomly swap the stats of all cards on field with each other', manaCost: 5, effect: 'swap_all_stats', value: 0 }),
  createCard('c21', 'Migrationsverket', 4, 4, 5, 'early', { name: 'Generosity', description: 'Add 2 Kirin cards to the opponent\'s hand', manaCost: 1, effect: 'add_cards_to_opponent_hand', value: 2 }),
  createCard('c22', 'Kirin', 1, 2, 1, 'early', { name: 'Drive by', description: 'Deal 1 damage to the enemy champion', manaCost: 1, effect: 'damage_enemy_player', value: 1 }),
  createCard('c23', 'Ben', 6, 6, 7, 'mid', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Smoke field', description: 'All units attacks have a 50% chance of landing on a random target', effect: 'smoke_field', value: 0 }),
  createCard('c24', 'White Knight Fonzie', 4, 2, 5, 'mid', { name: 'Cock Block', description: 'Create a shield for an ally unit that blocks 1 instance of damage for one round', manaCost: 3, effect: 'protect_friendly_card', value: 0 }),
  createCard('c25', 'Jims Bond', 3, 3, 2, 'early', { name: 'Infiltrate', description: 'Deal 2 damage to an enemy unit', manaCost: 1, effect: 'damage_enemy_card', value: 2 }),
  createCard('c26', 'Sandy Halime', 5, 3, 5, 'mid', { name: 'Morale boost', description: 'Give all friendly units (except Sandy Halime) +2/2', manaCost: 3, effect: 'buff_all_friendly_except_self', value: 2 }),
  createCard('c27', 'Joker Wheat (Legendary)', 7, 5, 8, 'late', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Cursed Domain', description: 'Prevent all spells from being played', effect: 'cursed_domain', value: 0 }),
  createCard('c28', 'AIK Ness', 2, 2, 2, 'early', { name: 'Yoyo glitch', description: 'Switch ATK and HP stats of any unit on the field', manaCost: 1, effect: 'switch_stats', value: 0 }),
  createCard('c29', 'Snearly Sandy', 3, 3, 4, 'early', { name: 'Steal', description: 'Steal a random card from your opponents hand', manaCost: 2, effect: 'steal_card', value: 0 }),
  createCard('c30', 'Vegan Gains', 5, 4, 5, 'mid', { name: 'Vegan Diet', description: 'Self destruct and then draw a card and play it, if it\'s a spell, do nothing', manaCost: 2, effect: 'vegan_diet', value: 0 }),
  createCard('c31', 'Jesper', 4, 2, 4, 'mid', { name: 'Introvert', description: 'If there are no friendly units on the field, gain 3 mana', manaCost: 0, effect: 'introvert_gain_mana', value: 3 }),
  createCard('c32', 'Muslim Jim', 5, 5, 5, 'late', { name: 'Ramadan', description: 'Lower the cost of the spells in your hand by (1)', manaCost: 2, effect: 'reduce_spell_cost_hand', value: 1 }),
  createCard('c33', 'Gigachad', 4, 5, 2, 'early', { name: 'BABABA', description: '+3 ATK to all friendly units on the field', manaCost: 4, effect: 'buff_all_friendly_attack', value: 3 }),
  createCard('c34', 'Virgin Sylas', 1, 1, 1, 'early', { name: 'Hijack', description: 'Copy any unit on the field and add the card to your hand', manaCost: 1, effect: 'copy_unit_to_hand', value: 0 }),
  createCard('c35', 'Bisexual Jim', 4, 3, 3, 'early', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Infatuate', description: 'All enemy units have 1 less health and damage, cannot go below 1 health', effect: 'infatuate_aura', value: 1 }),
  createCard('c38', 'Cerys', 4, 3, 3, 'mid', { name: 'Witchcraft', description: 'Add 2 random spells to your hand', manaCost: 3, effect: 'add_random_spells_to_hand', value: 2 }),
  createCard('c39', 'Sloopy', 6, 6, 5, 'late', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Argue', description: 'If an enemy dies when sloopy attacks, he will attack another unit', effect: 'attack_again_on_kill', value: 0 }),
  createCard('c40', 'Wizard Watri (Legendary)', 2, 2, 3, 'early', { name: 'Conjure', description: 'Draw a random spell from your deck', manaCost: 2, effect: 'draw_spell_from_deck', value: 1 }),
  createCard('c41', 'Gnome Child', 1, 1, 2, 'early', { name: 'None', description: 'None', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Arcanist', description: 'Whenever you play a spell, deal 1 damage to a random enemy 2 times', effect: 'on_spell_cast_damage_random_enemy', value: 1, value2: 2 }),
  
  createCard('c37', 'Depressed Jesper (Legendary)', 5, 4, 6, 'mid', { name: 'None', description: 'No ability yet', manaCost: 0, effect: 'none', value: 0 }, undefined, undefined, { name: 'Negative Aura', description: 'All units on enemy board have -2 attack', effect: 'negative_aura', value: 2 }),
  
  // Spells
  createSpell('s1', 'Hazz', 2, 'early', { name: 'Hazz', description: 'Prevent a friendly unit from going below 1 hp for 1 turn', manaCost: 2, effect: 'prevent_death', value: 1 }),
  createSpell('s2', 'Charm (lillepus)', 1, 'early', { name: 'Charm', description: 'Lower the stats of an enemy unit by 2/2', manaCost: 1, effect: 'debuff_card_stats', value: 2 }),
  createSpell('s3', "Jim's Livbåt", 2, 'mid', { name: 'Resurrection', description: 'Resurrect a random unit from your graveyard', manaCost: 3, effect: 'resurrect_random', value: 1 }),
  createSpell('s4', 'Ban hammer', 5, 'late', { name: 'Ban', description: 'Destroy a unit, this unit cannot be resurrected from the graveyard', manaCost: 5, effect: 'banish_unit', value: 0 }),
  createSpell('s5', 'Aegyo', 2, 'early', { name: 'Aegyo', description: 'Give any unit +2/2 (If it\'s Lilljesper, Jesper or Depressed jesper give it +3/3)', manaCost: 2, effect: 'buff_jesper_v2', value: 2, value2: 3 }),
  createSpell('s6', 'Carl G', 2, 'early', { name: 'Carl G', description: 'Throw a stitch face to an enemy unit or champion and deal 3 dmg', manaCost: 2, effect: 'damage_enemy_card_or_champion', value: 3 }),
  createSpell('s20', 'Hatseekers', 3, 'mid', { name: 'Hatseekers', description: 'Damage 2 random enemy units for 3 damage', manaCost: 3, effect: 'damage_2_random_enemies_3_dmg', value: 3 }),
  createSpell('s7', 'My Summer Car', 6, 'late', { name: 'My Summer Car', description: 'Both you and the opponent discards all the cards in your hand to the graveyard', manaCost: 6, effect: 'discard_all', value: 0 }),
  createSpell('s8', 'Propane tank', 2, 'early', { name: 'Propane tank', description: 'Select an enemy minion. That minion takes 2x damage this round', manaCost: 2, effect: 'mark_vulnerable', value: 2 }),
  createSpell('s9', 'Discord Nitro', 2, 'early', { name: 'Discord Nitro', description: 'Gain +1 Mana for every unit on field (including enemy side)', manaCost: 2, effect: 'gain_mana_per_unit', value: 1 }),
  createSpell('s10', 'Ubercharge', 4, 'mid', { name: 'Ubercharge', description: 'Heal all friendly units and champion +4', manaCost: 4, effect: 'heal_all_friendly_and_champion', value: 4 }),
  createSpell('s11', 'Doomscroll', 3, 'mid', { name: 'Doomscroll', description: 'Draw 2 cards', manaCost: 3, effect: 'draw_cards', value: 2 }),
  createSpell('s12', "Yoshi's Story", 5, 'late', { name: "Yoshi's Story", description: 'For 2 turns, HP and Mana Cost for cards are switched for both players', manaCost: 5, effect: 'switch_hp_mana', value: 2 }),
  createSpell('s15', 'Jizzsperm', 4, 'mid', { name: 'Jizzsperm', description: 'Deal 2 damage to all enemy units including their champion', manaCost: 4, effect: 'damage_all_enemies', value: 2 }),
  createSpell('s16', 'Insect Swarm', 4, 'mid', { name: 'Insect Swarm', description: 'Buff all friendly cards named Jim on the board by 2/2', manaCost: 4, effect: 'buff_jim', value: 2 }),
  createSpell('s17', 'Server delete', 8, 'late', { name: 'Server delete', description: 'Destroy all units on the board, these units cannot be resurrected from the graveyard', manaCost: 8, effect: 'banish_all', value: 0 }),
  createSpell('s18', 'Server lag', 4, 'mid', { name: 'Server lag', description: 'Deal 1 damage to all enemy units on the board and prevents using abilities and passives on the opponent\'s board for 1 turn', manaCost: 4, effect: 'silence_opponent_v2', value: 1 }),
  createSpell('s19', 'Fjewsion', 3, 'mid', { name: 'Fjewsion', description: 'If both Jonte and Eggbert are on the friendly board, destroy them and summon Jewtwo (Legendary) instead', manaCost: 3, effect: 'fjewsion', value: 0 }),
  createSpell('s21', 'Strellan', 3, 'early', { name: 'Strellan', description: 'Reduce the ability cost for all friendly units by 2 for 1 turn', manaCost: 3, effect: 'reduce_ability_cost_temp', value: 2 }),
  createSpell('s22', 'Steroids', 1, 'early', { name: 'Steroids', description: 'Give a unit +3 attack this turn', manaCost: 1, effect: 'buff_unit_attack', value: 3 }),
  createSpell('s23', 'Ragequit', 2, 'early', { name: 'Ragequit', description: 'Deal 4 damage to the enemy champion', manaCost: 2, effect: 'damage_enemy_champion_v2', value: 4 }),
];

export const encodeDeck = (deck: Card[]): string => {
  return deck.map(c => c.id).join(',');
};

export const decodeDeck = (code: string): Card[] => {
  const ids = code.split(',');
  const deck: Card[] = [];
  ids.forEach(id => {
    const card = CARD_POOL.find(c => c.id === id);
    if (card) deck.push({ ...card });
  });
  return deck;
};

export const TURN_CHANGE_SFX = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';

export const generateRandomDeck = (): Card[] => {
  const deck: Card[] = [];
  // Create a pool with 2 copies of each card
  const pool = [...CARD_POOL, ...CARD_POOL];
  
  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let hasLegendary = false;

  for (const card of pool) {
    if (deck.length >= 20) break;

    const isLegendary = card.name.includes('(Legendary)');
    if (isLegendary) {
      if (hasLegendary) continue;
      hasLegendary = true;
    }

    if (card.name === 'Aegyo') {
      const hasRequirement = deck.some(c => c.name === 'Lilljesper' || c.name === 'Jeper');
      if (!hasRequirement) continue;
    }

    if (card.name === 'Fjewsion') {
      const hasEggbert = deck.some(c => c.name === 'Eggbert');
      const hasJonte = deck.some(c => c.name === 'Jonte');
      if (!hasEggbert || !hasJonte) continue;
    }

    deck.push({ 
      ...card, 
      id: `${card.id}-${deck.length}-${Math.random().toString(36).substr(2, 9)}` 
    });
  }

  // If we didn't get 20 cards (unlikely but possible with filters), 
  // we could fill with non-restricted cards, but with 2 copies of 48+ cards, 
  // we'll definitely hit 20.
  
  return deck;
};
