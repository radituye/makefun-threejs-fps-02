// EMBERLINE: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; the round state machine (buy -> live -> over -> buy ...) lives
// here, because it is the only place that sees the player, the bots, the spike and
// the economy together. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPON_DEFS, GRENADE_DEF } from './weapons.js';
import { createBots } from './bots.js';
import { createSpike, PLANT_SECONDS, DETONATE_SECONDS } from './spike.js';
import { createEconomy, applyArmor, BUY_SECONDS, ROUND_SECONDS, ARMOR_PRICE, ARMOR_MAX } from './economy.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { makeColliderTester } from './body.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);
// ?lowfx=1 drops the pixel ratio to 1 and turns shadows off: for low-end machines
// and for automated play-tests, where software rendering is the bottleneck.
const lowFx = params.get('lowfx') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowFx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const overlaps = makeColliderTester(world.colliders);
const player = createPlayer(overlaps);
const weapons = createWeapons(camera);
const bots = createBots(scene, world, random);
const spike = createSpike(scene);
const economy = createEconomy();
const fx = createFx(scene, camera);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

// Invisible hitboxes for the player, so bot shots are checked against a body the
// same way player shots are checked against bot bodies.
const playerHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.95, 0.42), playerHitMaterial);
playerTorso.userData.part = 'torso';
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), playerHitMaterial);
playerHead.userData.part = 'head';
scene.add(playerTorso, playerHead);
const playerHitMeshes = [playerHead, playerTorso];

const state = {
  health: 100,
  started: false,
  roundOver: false,
  roundResult: null,
  roundOverAt: 0,
  grenades: [],
  wasFiring: false,
  plantHeld: false,
  fov: 74,
};

const body = player.state;
bots.placeAtSpawn();
syncCamera();
syncPlayerHitboxes();
refreshHud();

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (economy.state.matchOver) {
    fullReset();
    input.requestLock();
    return;
  }
  if (state.roundOver) {
    advanceRound();
    input.requestLock();
    return;
  }
  if (!state.started) {
    state.started = true;
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    state.started = true;
    hud.hideOverlay();
  } else if (!state.roundOver && !economy.state.matchOver) {
    hud.showOverlay(state.started ? 'paused' : 'start');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncPlayerHitboxes() {
  playerTorso.position.set(body.position.x, body.position.y + 0.95, body.position.z);
  playerHead.position.set(body.position.x, body.position.y + 1.55, body.position.z);
}

function refreshHud() {
  const ammo = weapons.currentAmmo();
  hud.setAmmo(ammo.mag, ammo.reserve, weapons.currentDef().name, weapons.state.grenades);
  hud.setHealth(state.health);
  hud.setArmor(economy.state.armor);
  hud.setMoney(economy.state.money);
  hud.setScore(economy.state.wins, economy.state.losses);
  hud.setPips(state.health > 0 ? 1 : 0, bots.aliveCount());
  hud.setTimer(economy.state.phase === 'buy' ? economy.state.phaseTime : economy.state.phaseTime);
  hud.setSpike(spike.state.mode === 'planted' ? `SPIKE PLANTED — ${Math.ceil(spike.state.timer)}s` : spike.state.mode === 'planting' ? 'PLANTING…' : 'SPIKE — CARRYING');
}

function resetRoundPositions() {
  player.reset(world.attackerSpawn.x, world.attackerSpawn.z, 0);
  bots.reset();
  spike.reset();
  state.grenades = [];
  state.health = 100;
  state.roundOver = false;
  state.roundResult = null;
  syncCamera();
  syncPlayerHitboxes();
}

function fullReset() {
  economy.reset();
  weapons.dropToPistol();
  economy.setArmor(0);
  resetRoundPositions();
  weapons.resetForRound();
  economy.startBuyPhase();
  hud.showBuy(false);
  refreshHud();
}

function advanceRound() {
  const died = state.health <= 0;
  resetRoundPositions();
  if (died) {
    // The player died: the round's kit is lost, back to the sidearm.
    weapons.dropToPistol();
    economy.setArmor(0);
  } else {
    weapons.refillAmmo();
  }
  weapons.resetForRound();
  economy.startBuyPhase();
  refreshHud();
}

function endRound(won, reason) {
  if (state.roundOver) return;
  state.roundOver = true;
  state.roundResult = won ? 'win' : 'loss';
  state.roundOverAt = performance.now();
  spike.cancelPlant();
  hud.setProgress(null, 0);
  if (won) {
    economy.onRoundWin();
    audio.roundWin();
    hud.banner(`ROUND WON — ${reason}`, 3000);
    hud.killfeed(`Round ${economy.state.round - 1} won: ${reason}`, true);
  } else {
    economy.onRoundLoss();
    audio.roundLose();
    hud.banner(`ROUND LOST — ${reason}`, 3000);
    hud.killfeed(`Round ${economy.state.round - 1} lost: ${reason}`, false);
  }
  if (document.pointerLockElement) document.exitPointerLock();
  refreshHud();
  setTimeout(() => {
    if (economy.state.matchOver) hud.showOverlay(economy.state.matchResult === 'win' ? 'matchWin' : 'matchLose');
    else hud.showOverlay(won ? 'roundWin' : 'roundLose', `${economy.state.wins} — ${economy.state.losses}`);
  }, 2600);
}

function killBot(bot, part) {
  economy.onKill();
  audio.kill();
  hud.killfeed(`You eliminated ${bot.name} (${part === 'head' ? 'headshot' : 'body'})  +$300`, true);
  hud.setMoney(economy.state.money);
  hud.setPips(1, bots.aliveCount());
  if (bots.aliveCount() === 0) endRound(true, 'yard cleared');
}

function damagePlayer(amount, part, fromPosition) {
  if (state.health <= 0 || state.roundOver) return;
  const split = applyArmor(economy.state.armor, amount);
  economy.setArmor(split.armor);
  state.health -= split.health;
  audio.hurt();
  const dx = body.position.x - fromPosition.x;
  const dz = body.position.z - fromPosition.z;
  const angle = Math.atan2(dx, dz) * (180 / Math.PI);
  hud.damageFlash(angle);
  hud.setHealth(state.health);
  hud.setArmor(economy.state.armor);
  if (state.health <= 0) {
    state.health = 0;
    hud.setHealth(0);
    hud.killfeed('You were eliminated', false);
    endRound(false, 'eliminated');
  }
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dryFire();
    return;
  }
  const weapon = weapons.currentDef();
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position);
  camera.localToWorld(muzzle.set(0.24, -0.18, -0.95));
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : camera.position.clone().add(direction.clone().multiplyScalar(80));
  fx.tracer(muzzle, end);
  audio.shot(weapon.id);
  bots.hearShot(body.position, performance.now() / 1000);
  if (hit) {
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const killed = bots.damage(bot, weapons.damageFor(part), part, performance.now() / 1000, body.position);
      hud.hitMarker(killed, killed ? 400 : 90);
      audio.hit();
      if (killed) killBot(bot, part);
    } else {
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      fx.impact(hit.point, normal);
    }
  }
  weapons.pullTrigger();
  player.recoil(weapon.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * weapon.kick * 0.5);
  fx.addShake(weapon.id === 'lance' ? 0.12 : 0.03);
  refreshHud();
}

function throwGrenade() {
  if (economy.state.phase !== 'live' || state.roundOver) return;
  camera.getWorldDirection(direction);
  const origin = camera.position.clone();
  const grenade = weapons.throwGrenade(origin, direction);
  if (!grenade) {
    audio.denied();
    return;
  }
  audio.grenadePin();
  state.grenades.push(grenade);
  refreshHud();
}

function explodeGrenade(grenade) {
  const point = grenade.position.clone();
  fx.explosion(point);
  audio.explosion();
  // Blast: full damage close in, falling off to a glancing hit at the edge.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const distance = Math.hypot(bot.body.position.x - point.x, bot.body.position.z - point.z) + Math.abs(bot.body.position.y + 1 - point.y) * 0.5;
    if (distance > 6) continue;
    const damage = Math.round(120 - (distance / 6) * 95);
    const killed = bots.damage(bot, damage, 'blast', performance.now() / 1000, body.position);
    if (killed) killBot(bot, 'blast');
  }
  const playerDistance = Math.hypot(body.position.x - point.x, body.position.z - point.z);
  if (playerDistance < 5) {
    const damage = Math.round(90 - (playerDistance / 5) * 65);
    damagePlayer(damage, 'blast', point);
  }
}

function stepGrenades(dt) {
  for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
    const grenade = state.grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 20 * dt;
    grenade.position.addScaledVector(grenade.velocity, dt);
    let bounced = false;
    if (grenade.position.y < 0.12) {
      grenade.position.y = 0.12;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.45;
      grenade.velocity.x *= 0.7;
      grenade.velocity.z *= 0.7;
      bounced = true;
    }
    if (Math.abs(grenade.position.x) > 21.8) {
      grenade.position.x = Math.sign(grenade.position.x) * 21.8;
      grenade.velocity.x *= -0.5;
      bounced = true;
    }
    if (Math.abs(grenade.position.z) > 16.8) {
      grenade.position.z = Math.sign(grenade.position.z) * 16.8;
      grenade.velocity.z *= -0.5;
      bounced = true;
    }
    if (bounced && grenade.bounced < 3) {
      grenade.bounced += 1;
      audio.bounce();
    }
    if (grenade.fuse <= 0) {
      state.grenades.splice(i, 1);
      explodeGrenade(grenade);
    }
  }
}

function buyPressed(code) {
  const weaponForKey = { Digit2: 'hornet', Digit3: 'harrier', Digit4: 'lance' };
  if (weaponForKey[code]) {
    const id = weaponForKey[code];
    if (weapons.state.owned[id]) {
      weapons.switchTo(id);
      refreshHud();
      return;
    }
    const check = economy.buyWeapon(id);
    if (!check.ok) {
      audio.denied();
      return;
    }
    const result = weapons.buy(id, economy.state.money);
    if (result.ok) {
      economy.spend(result.cost);
      audio.buy();
      weapons.switchTo(id);
    } else {
      audio.denied();
    }
  } else if (code === 'Digit5') {
    const check = economy.buyGrenade();
    const result = check.ok ? weapons.buyGrenade(economy.state.money) : check;
    if (result.ok) {
      economy.spend(result.cost);
      audio.buy();
    } else audio.denied();
  } else if (code === 'Digit6') {
    const check = economy.buyArmor();
    if (check.ok) {
      economy.spend(check.cost);
      economy.setArmor(ARMOR_MAX);
      audio.buy();
    } else audio.denied();
  }
  refreshHud();
}

function step(dt, time) {
  // Phases: the buy clock and the round clock only run while the player is in.
  if (state.started && !state.roundOver && !economy.state.matchOver) {
    economy.state.phaseTime -= dt;
    if (economy.state.phase === 'buy' && economy.state.phaseTime <= 0) {
      economy.startLivePhase();
      hud.showBuy(false);
      hud.banner('ROUND LIVE — PLANT THE SPIKE', 2200);
    } else if (economy.state.phase === 'live' && economy.state.phaseTime <= 0 && spike.state.mode !== 'planted') {
      endRound(false, 'time expired — spike never planted');
    }
  }

  player.step(dt, input.state.keys);
  weapons.step(dt);
  stepGrenades(dt);

  // Aim-down-sights for the DMR: field of view and sensitivity narrow together.
  const weapon = weapons.currentDef();
  const aiming = input.state.aiming && weapon.zoom > 1 && weapons.state.reloadLeft === 0;
  weapons.state.aiming = aiming;
  const targetFov = aiming ? 74 / weapon.zoom : 74;
  state.fov += (targetFov - state.fov) * Math.min(1, dt * 10);
  if (Math.abs(camera.fov - state.fov) > 0.05) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
  hud.setScope(aiming);

  // Planting: hold E inside a site, standing still, while the round is live.
  const site = world.insideSite(body.position.x, body.position.z);
  const planting = economy.state.phase === 'live' && !state.roundOver && spike.state.mode !== 'planted'
    && input.state.keys.has('KeyE') && site && player.groundSpeed() < 0.6;
  if (planting) {
    const planted = spike.plantStep(dt, site, body.position);
    hud.setProgress(`PLANTING SPIKE — SITE ${site}`, spike.state.plantProgress / PLANT_SECONDS);
    if (planted) {
      audio.plantBeep(true);
      hud.banner(`SPIKE PLANTED — SITE ${site}`, 2600);
      hud.killfeed(`Spike planted at site ${site} — defend it`, true);
      hud.setProgress(null, 0);
    }
  } else {
    spike.cancelPlant();
    hud.setProgress(null, 0);
  }

  const detonation = spike.step(dt, time, (final) => audio.plantBeep(final));
  if (detonation === 'detonated') {
    fx.explosion(spike.position);
    audio.explosion();
    endRound(true, 'spike detonated');
  }

  bots.step(dt, time, player, spike, random, {
    onBotShot(bot, from, direction, distance) {
      // A bot's shot is a ray like the player's, checked against the player's
      // hitboxes and the world's cover — cover really does block it.
      raycaster.set(from, direction);
      const hit = raycaster.intersectObjects(playerHitMeshes.concat(world.shootables), false)[0];
      const end = hit ? hit.point : from.clone().add(direction.clone().multiplyScalar(60));
      fx.tracer(from, end);
      audio.enemyShot(distance);
      if (hit && hit.object.userData.part) {
        const damage = hit.object.userData.part === 'head' ? 24 * 3 : 24;
        damagePlayer(damage, hit.object.userData.part, from);
      } else if (hit) {
        const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
        fx.impact(hit.point, normal);
      }
    },
    onDefused(bot) {
      hud.killfeed(`${bot.name} defused the spike`, false);
      endRound(false, 'spike defused');
    },
  });

  // Elimination: checked every step, not only at the kill call sites, so the
  // round ends however the last bot went down (shot, grenade, or any later
  // damage path). Only live rounds count — the buy phase always has 5 alive.
  if (economy.state.phase === 'live' && !state.roundOver && bots.aliveCount() === 0) {
    endRound(true, 'yard cleared');
  }

  fx.step(dt);
  syncCamera();
  syncPlayerHitboxes();
  refreshHud();
}

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.15);
  lastTime = now;
  if (!frozen && !shot) {
    const look = input.takeLook();
    const sensitivityScale = weapons.state.aiming ? 0.45 : 1;
    player.look(look.x * sensitivityScale, look.y * sensitivityScale);
    // Firing: automatics hold the trigger; semi-automatics fire once per click.
    const weapon = weapons.currentDef();
    if (input.state.firing && weapons.ready()) {
      if (weapon.auto || !state.wasFiring) shoot(weapons.spread(player.groundSpeed(), !player.state.onGround));
    }
    state.wasFiring = input.state.firing;
    if (input.state.keys.has('KeyR') && weapons.reload()) audio.reload();
    for (const code of input.takePressed()) {
      if (code === 'KeyM') audio.toggleMute();
      if (code === 'KeyG') throwGrenade();
      if (code === 'KeyB' && economy.state.phase === 'buy') hud.showBuy(!document.getElementById('buy-menu').hidden);
      if (economy.state.phase === 'buy' && code.startsWith('Digit')) buyPressed(code);
      else if (economy.state.phase === 'live' && code === 'Digit1') weapons.switchTo('sparrow');
      else if (economy.state.phase === 'live' && code === 'Digit2') weapons.switchTo('hornet');
      else if (economy.state.phase === 'live' && code === 'Digit3') weapons.switchTo('harrier');
      else if (economy.state.phase === 'live' && code === 'Digit4') weapons.switchTo('lance');
      else if (economy.state.phase === 'live' && code === 'Digit5') throwGrenade();
    }
    if (state.started) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 8) {
        step(FIXED_STEP, now / 1000);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 8) accumulator = 0;
    } else {
      // Before the first click the world idles: bots hold, nothing moves.
      hud.setCrosshairSpread(0.004);
    }
    hud.setCrosshairSpread(weapons.spread(player.groundSpeed(), !player.state.onGround));
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP, index * FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  state.started = true;
  hud.hideOverlay();
  hud.setScore(1, 0);
  economy.state.wins = 1;
  if (name === 'start') {
    // Buy phase at the attacker spawn, buy menu open, the yard ahead.
    body.position.set(0, 0, 14);
    body.yaw = 0;
    body.pitch = 0;
    economy.state.money = 4250;
    economy.state.phase = 'buy';
    economy.state.phaseTime = BUY_SECONDS;
    weapons.buy('harrier', 99999);
    weapons.switchTo('harrier');
    weapons.resetForRound();
    hud.showBuy(true);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -4));
    hud.setScore(0, 0);
    economy.state.wins = 0;
  } else if (name === 'play') {
    // Mid-fight in the mid lane: two defenders in view, one shot already fired.
    economy.state.phase = 'live';
    economy.state.phaseTime = 84;
    body.position.set(-2, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    weapons.buy('harrier', 99999);
    weapons.switchTo('harrier');
    weapons.resetForRound();
    settle(30);
    const bot = bots.bots[0];
    bot.body.position.set(1.5, 0, -3.5);
    bot.body.yaw = Math.PI;
    bot.mesh.group.position.copy(bot.body.position);
    bot.mesh.group.rotation.y = bot.body.yaw;
    const bot2 = bots.bots[1];
    bot2.body.position.set(-4, 0, -6);
    bot2.body.yaw = Math.PI * 0.8;
    bot2.mesh.group.position.copy(bot2.body.position);
    bot2.mesh.group.rotation.y = bot2.body.yaw;
    aimAt(new THREE.Vector3(1.5, 1.3, -3.5));
    shoot(0);
    settle(6);
    hud.setHealth(100);
  } else {
    // Round won at site A: spike planted, defenders down, banner up.
    economy.state.phase = 'live';
    economy.state.phaseTime = 12;
    economy.state.wins = 2;
    economy.state.losses = 1;
    body.position.set(14, 0, -6);
    body.yaw = 0;
    body.pitch = 0;
    weapons.buy('harrier', 99999);
    weapons.switchTo('harrier');
    weapons.resetForRound();
    spike.state.mode = 'planted';
    spike.state.site = 'A';
    spike.state.timer = 18;
    spike.state.position.set(16, 0.12, -12);
    spike.group.position.copy(spike.state.position);
    spike.group.visible = true;
    const downed = bots.bots[0];
    downed.alive = false;
    downed.state = 'dead';
    downed.mesh.group.rotation.x = -Math.PI / 2;
    downed.mesh.group.position.set(15, 0.25, -10);
    settle(10);
    aimAt(new THREE.Vector3(16, 1.2, -12));
    hud.setScore(2, 1);
    hud.banner('ROUND WON — SPIKE DETONATED', 60000);
  }
  refreshHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle, only when ?debug=1: lets an automated play-test read the sim state
// (positions, health, round phase) and advance the simulation without changing how
// the game plays. It is not used by the game itself.
if (params.get('debug') === '1') {
  window.__ember = {
    state,
    economy,
    weapons,
    bots,
    spike,
    player,
    world,
    // Advance the fixed-step simulation by the given seconds, synchronously.
    advance(seconds) {
      const steps = Math.ceil(seconds / FIXED_STEP);
      for (let i = 0; i < steps; i += 1) step(FIXED_STEP, performance.now() / 1000);
    },
  };
}

if (shot) runShot(shot);
else requestAnimationFrame(frame);
