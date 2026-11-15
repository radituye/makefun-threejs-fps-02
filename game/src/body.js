// One body, one physics: a capsule approximated as a box, resolved against the
// world's colliders one axis at a time so a wall never swallows a body. The player
// and every bot step through this same code, so they collide with the map identically.
import * as THREE from 'three';

const GRAVITY = 20;
const RADIUS = 0.34;

export function createBody(x, z, height, eye) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye,
    standEye: eye,
    height,
    standHeight: height,
    onGround: true,
    crouching: false,
  };
}

export function makeColliderTester(colliders) {
  const probe = new THREE.Box3();
  return function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    // Return the intersecting collider with the highest top. Returning the first
    // one broke standing on a platform: the ground (top 0) is listed first and
    // touches the probe at y = 0, so a body on a deck was pinned to y = 0 and
    // the deck then blocked every horizontal move — the body could never walk.
    let best = null;
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) {
        if (!best || collider.max.y > best.max.y) best = collider;
      }
    }
    return best;
  };
}

// wishX/wishZ is the desired horizontal direction (already normalised, length 0..1).
// accel blends velocity toward wish*speed; friction only bites on the ground.
export function stepBody(body, dt, overlaps, wishX, wishZ, speed, accel, friction, jump) {
  const blend = Math.min(1, (accel * dt) / Math.max(0.01, speed));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }

  if (jump && body.onGround) {
    body.velocity.y = 6.2;
    body.onGround = false;
  }
  body.velocity.y -= GRAVITY * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
