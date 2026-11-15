// The spike: the round's objective. The player carries it, plants it at site A or
// B by holding E inside the zone, and then defends it while the defenders converge
// to defuse. Detonation wins the round for the attackers; a defuse, or the round
// timer running out before a plant, wins it for the defenders.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_SECONDS = 3.5;
export const DETONATE_SECONDS = 35;

export function createSpike(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2b2733, roughness: 0.5, metalness: 0.5 }),
  );
  body.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.y = 0.12;
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    mode: 'carried', // carried | planting | planted | detonated | defused
    site: null,
    plantProgress: 0,
    defuseProgress: 0,
    timer: DETONATE_SECONDS,
    position: new THREE.Vector3(),
    beepAt: 0,
  };

  function showAt(x, z) {
    state.position.set(x, 0.12, z);
    group.position.copy(state.position);
    group.visible = true;
  }

  return {
    state,
    group,
    get position() {
      return state.position;
    },
    reset() {
      state.mode = 'carried';
      state.site = null;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.timer = DETONATE_SECONDS;
      state.beepAt = 0;
      group.visible = false;
    },
    // Called every step while the player holds E in a site. Returns true on plant.
    plantStep(dt, site, playerPosition) {
      if (state.mode === 'carried' || state.mode === 'planting') {
        state.mode = 'planting';
        state.site = site;
        state.plantProgress += dt;
        if (state.plantProgress >= PLANT_SECONDS) {
          state.mode = 'planted';
          state.timer = DETONATE_SECONDS;
          showAt(playerPosition.x, playerPosition.z);
          return true;
        }
      }
      return false;
    },
    cancelPlant() {
      if (state.mode === 'planting') {
        state.mode = 'carried';
        state.plantProgress = 0;
        state.site = null;
      }
    },
    // Counts the detonation timer down; returns 'detonated' when it hits zero.
    step(dt, time, onBeep) {
      if (state.mode !== 'planted') return null;
      state.timer -= dt;
      // Beeps accelerate as the timer runs out: every 1.0 s, then 0.5 s, then 0.25 s.
      const interval = state.timer > 15 ? 1.0 : state.timer > 7 ? 0.5 : 0.25;
      if (time - state.beepAt >= interval) {
        state.beepAt = time;
        if (onBeep) onBeep(state.timer <= 7);
      }
      const pulse = 0.6 + 0.4 * Math.sin(time * 10);
      light.material.color.setHex(0xf5a02c).multiplyScalar(pulse);
      if (state.timer <= 0) {
        state.mode = 'detonated';
        group.visible = false;
        return 'detonated';
      }
      return null;
    },
  };
}
