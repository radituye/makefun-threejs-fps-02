// The armoury: four guns and a frag grenade. Each gun owns its numbers — damage,
// headshot multiplier, magazine, fire rate, reload, spread — and its view model,
// built from boxes so every weapon reads differently at a glance. main.js owns the
// ray and the damage; this module owns the trigger, the magazine and the bloom.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  sparrow: {
    id: 'sparrow', slot: 1, name: 'P9 Sparrow', kind: 'pistol', price: 300,
    damage: 34, headMult: 3, mag: 12, reserve: 36, gap: 0.16, auto: false,
    reloadTime: 1.4, spreadStill: 0.003, spreadMove: 0.02, kick: 0.006, zoom: 1,
  },
  hornet: {
    id: 'hornet', slot: 2, name: 'Hornet SMG', kind: 'smg', price: 1500,
    damage: 26, headMult: 3, mag: 28, reserve: 84, gap: 0.075, auto: true,
    reloadTime: 2.0, spreadStill: 0.006, spreadMove: 0.03, kick: 0.005, zoom: 1,
  },
  harrier: {
    id: 'harrier', slot: 3, name: 'Harrier AR', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, mag: 25, reserve: 75, gap: 0.1, auto: true,
    reloadTime: 2.2, spreadStill: 0.002, spreadMove: 0.026, kick: 0.008, zoom: 1,
  },
  lance: {
    id: 'lance', slot: 4, name: 'Lance DMR', kind: 'dmr', price: 4200,
    damage: 88, headMult: 2.5, mag: 5, reserve: 15, gap: 1.1, auto: false,
    reloadTime: 3.0, spreadStill: 0.0008, spreadMove: 0.02, kick: 0.02, zoom: 3,
  },
};

export const GRENADE_DEF = { id: 'frag', slot: 5, name: 'Ember Frag', price: 300, maxCarry: 2 };

const MUZZLE_TIME = 0.06;
const DRAW_TIME = 0.45;

function buildViewModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2733, roughness: 0.55, metalness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a3049, roughness: 0.8, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const teal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ash), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  function part(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (def.id === 'sparrow') {
    part(dark, 0.06, 0.07, 0.26, 0, 0, -0.1); // slide
    part(grip, 0.05, 0.12, 0.08, 0, -0.08, 0.05); // grip
    part(steel, 0.02, 0.02, 0.06, 0, 0.045, -0.2); // front sight
  } else if (def.id === 'hornet') {
    part(dark, 0.08, 0.1, 0.34, 0, 0, -0.06);
    part(teal, 0.05, 0.05, 0.22, 0, 0.01, -0.32); // suppressor
    part(grip, 0.06, 0.14, 0.09, 0, -0.1, 0.06);
    part(dark, 0.05, 0.12, 0.05, 0, -0.1, -0.12); // magazine
    part(accent, 0.02, 0.02, 0.1, 0, 0.06, -0.1);
  } else if (def.id === 'harrier') {
    part(dark, 0.09, 0.11, 0.46, 0, 0, -0.1);
    part(steel, 0.04, 0.04, 0.34, 0, 0.02, -0.44); // barrel
    part(grip, 0.07, 0.13, 0.09, 0, -0.1, 0.08);
    part(dark, 0.05, 0.16, 0.06, 0, -0.12, -0.1); // magazine
    part(accent, 0.03, 0.03, 0.2, 0, 0.07, -0.12); // rail
  } else {
    part(dark, 0.08, 0.1, 0.5, 0, 0, -0.12);
    part(steel, 0.035, 0.035, 0.5, 0, 0.02, -0.6); // long barrel
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.1);
    model.add(scope);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), accent);
    lens.position.set(0, 0.08, -0.205);
    lens.rotation.y = Math.PI;
    model.add(lens);
    part(grip, 0.06, 0.13, 0.09, 0, -0.1, 0.1);
    part(dark, 0.04, 0.12, 0.05, 0, -0.1, -0.08);
  }
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPON_DEFS)) {
    const model = buildViewModel(def);
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'sparrow',
    owned: { sparrow: { mag: 12, reserve: 36 } },
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    drawLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    aiming: false,
  };

  function def() {
    return WEAPON_DEFS[state.current];
  }

  function ammo() {
    return state.owned[state.current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.drawLeft = Math.max(0, state.drawLeft - dt);
    const model = models[state.current];
    const lowering = state.aiming && def().zoom > 1 ? 0.06 : 0;
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 + lowering + state.kick * 0.4;
    model.rotation.x = state.kick * 2.2 - (state.drawLeft > 0 ? state.drawLeft * 0.9 : 0);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo().mag;
        const take = Math.min(need, ammo().reserve);
        ammo().mag += take;
        ammo().reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPON_DEFS,
    step,
    currentDef: def,
    currentAmmo: ammo,
    aiming: false,
    buy(id, money) {
      const weapon = WEAPON_DEFS[id];
      if (!weapon || state.owned[id]) return { ok: false, cost: 0 };
      if (money < weapon.price) return { ok: false, cost: weapon.price };
      state.owned[id] = { mag: weapon.mag, reserve: weapon.reserve };
      return { ok: true, cost: weapon.price };
    },
    buyGrenade(money) {
      if (state.grenades >= GRENADE_DEF.maxCarry) return { ok: false, cost: 0 };
      if (money < GRENADE_DEF.price) return { ok: false, cost: GRENADE_DEF.price };
      state.grenades += 1;
      return { ok: true, cost: GRENADE_DEF.price };
    },
    buyArmor(money) {
      if (money < 650) return { ok: false, cost: 650 };
      return { ok: true, cost: 650 };
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current || state.reloadLeft > 0) return false;
      state.current = id;
      state.drawLeft = DRAW_TIME;
      state.cooldown = Math.max(state.cooldown, 0.15);
      showModel();
      return true;
    },
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.drawLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().id === 'lance' ? 0.09 : 0.055;
      state.bloom = Math.min(1, state.bloom + (def().auto ? 0.12 : 0.2));
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      const weapon = def();
      if (state.reloadLeft > 0 || ammo().mag === weapon.mag || ammo().reserve === 0) return false;
      state.reloadLeft = weapon.reloadTime;
      return true;
    },
    spread(speed, airborne) {
      const weapon = def();
      const moveFactor = Math.min(1, speed / 5.4) * weapon.spreadMove;
      const airPenalty = airborne ? 0.02 : 0;
      const aimBonus = state.aiming ? 0.45 : 1;
      return (weapon.spreadStill + moveFactor + airPenalty + state.bloom * 0.004) * aimBonus;
    },
    damageFor(part) {
      const weapon = def();
      return part === 'head' ? Math.round(weapon.damage * weapon.headMult) : weapon.damage;
    },
    refillAmmo() {
      for (const [id, entry] of Object.entries(state.owned)) {
        entry.mag = WEAPON_DEFS[id].mag;
        entry.reserve = WEAPON_DEFS[id].reserve;
      }
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0) return null;
      state.grenades -= 1;
      return {
        position: origin.clone(),
        velocity: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: 1.6,
        bounced: 0,
      };
    },
    resetForRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.drawLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.aiming = false;
      if (!state.owned[state.current]) state.current = 'sparrow';
      showModel();
    },
    dropToPistol() {
      state.owned = { sparrow: { mag: WEAPON_DEFS.sparrow.mag, reserve: WEAPON_DEFS.sparrow.reserve } };
      state.current = 'sparrow';
      state.grenades = 0;
      showModel();
    },
  };
}
