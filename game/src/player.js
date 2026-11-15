// The player: keyboard movement wrapped around the shared body physics. Crouch
// shrinks the body and the eye; standing back up is refused while a ceiling is
// overhead. Look and recoil only touch yaw and pitch.
import * as THREE from 'three';
import { createBody, stepBody, groundSpeed } from './body.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 10;
const FRICTION = 9.5;

export function createPlayer(overlaps) {
  const body = createBody(0, 14, STAND_HEIGHT, STAND_EYE);
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0021) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching) {
      // Only stand up when the full-height body fits.
      if (!overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
        body.crouching = false;
        body.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = body.crouching ? CROUCH_SPEED : WALK_SPEED;
    stepBody(body, dt, overlaps, wish.x, wish.z, speed, body.onGround ? GROUND_ACCEL : AIR_ACCEL, FRICTION, keys.has('Space'));
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return groundSpeed(body);
    },
    reset(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      body.crouching = false;
      body.height = STAND_HEIGHT;
      body.eye = STAND_EYE;
    },
  };
}
