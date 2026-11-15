// The economy and the round flow: money earned and spent, the buy phase between
// rounds, and the match score. First to 5 round wins takes the match; at 4-4 the
// ninth round decides it. Loss bonus grows with each consecutive loss, so a team
// that keeps losing can still buy back in.
import { WEAPON_DEFS, GRENADE_DEF } from './weapons.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const ARMOR_PRICE = 650;
export const ARMOR_MAX = 100;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARDS = [1900, 2400, 2900, 3400];

export function createEconomy() {
  const state = {
    money: START_MONEY,
    armor: 0,
    round: 1,
    wins: 0,
    losses: 0,
    lossStreak: 0,
    phase: 'buy', // buy | live | over
    phaseTime: BUY_SECONDS,
    matchOver: false,
    matchResult: null,
  };

  return {
    state,
    reset() {
      state.money = START_MONEY;
      state.armor = 0;
      state.round = 1;
      state.wins = 0;
      state.losses = 0;
      state.lossStreak = 0;
      state.phase = 'buy';
      state.phaseTime = BUY_SECONDS;
      state.matchOver = false;
      state.matchResult = null;
    },
    startBuyPhase() {
      state.phase = 'buy';
      state.phaseTime = BUY_SECONDS;
    },
    startLivePhase() {
      state.phase = 'live';
      state.phaseTime = ROUND_SECONDS;
    },
    onKill() {
      state.money += KILL_REWARD;
    },
    onRoundWin() {
      state.wins += 1;
      state.money += WIN_REWARD;
      state.lossStreak = 0;
      state.round += 1;
      if (state.wins >= WIN_ROUNDS) {
        state.matchOver = true;
        state.matchResult = 'win';
      }
    },
    onRoundLoss() {
      state.losses += 1;
      state.money += LOSS_REWARDS[Math.min(state.lossStreak, LOSS_REWARDS.length - 1)];
      state.lossStreak += 1;
      state.round += 1;
      if (state.losses >= WIN_ROUNDS) {
        state.matchOver = true;
        state.matchResult = 'loss';
      }
    },
    buyWeapon(id) {
      const def = WEAPON_DEFS[id];
      if (!def) return { ok: false, reason: 'no such weapon' };
      if (state.money < def.price) return { ok: false, reason: 'not enough money' };
      return { ok: true, cost: def.price };
    },
    buyGrenade() {
      if (state.money < GRENADE_DEF.price) return { ok: false, reason: 'not enough money' };
      return { ok: true, cost: GRENADE_DEF.price };
    },
    buyArmor() {
      if (state.armor >= ARMOR_MAX) return { ok: false, reason: 'armor already full' };
      if (state.money < ARMOR_PRICE) return { ok: false, reason: 'not enough money' };
      return { ok: true, cost: ARMOR_PRICE };
    },
    spend(amount) {
      state.money -= amount;
    },
    setArmor(value) {
      state.armor = value;
    },
  };
}

// Damage through armour: armour absorbs half the damage until it runs out.
export function applyArmor(armor, damage) {
  if (armor <= 0) return { health: damage, armor: 0 };
  const absorbed = Math.min(armor, Math.ceil(damage / 2));
  return { health: damage - absorbed, armor: armor - absorbed };
}
