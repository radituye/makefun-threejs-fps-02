// The Ashen defenders: five bots that walk the waypoint graph, hold angles, patrol
// the sites, and shoot back. A bot only sees what its eyes can see — line of sight
// through the world's colliders, a field of view, and a reaction delay that grows
// with distance — and only hears gunfire close by. When the spike is planted they
// converge on the site and one of them channels the defuse.
import * as THREE from 'three';
import { createBody, stepBody, groundSpeed, makeColliderTester } from './body.js';
import { range, pick } from './rng.js';

const BOT_NAMES = ['Rook', 'Vex', 'Moss', 'Kite', 'Bramble'];
const BOT_HEALTH = 100;
const BOT_SPEED = 3.6;
const BOT_DAMAGE = 24;
const BOT_HEAD_MULT = 3;
const SEE_RANGE = 42;
const HEAR_RANGE = 28;
const DEFUSE_SECONDS = 5;
const REACT_BASE = 0.38;
const REACT_PER_METER = 0.012;

const HOLD_NODES = [7, 11, 13, 14, 3];
const PATROL_NODES = [2, 5, 9, 13, 14, 15, 16];

export function createBots(scene, world, random) {
  const overlaps = makeColliderTester(world.colliders);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.7, metalness: 0.2 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.6, metalness: 0.2 });
  const visorMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fc2b4) });
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 0.5, metalness: 0.5 });

  const torsoGeometry = new THREE.BoxGeometry(0.56, 0.82, 0.32);
  const headGeometry = new THREE.SphereGeometry(0.17, 14, 10);
  const visorGeometry = new THREE.BoxGeometry(0.22, 0.05, 0.05);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.62, 0.22);
  const gunGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.55);

  const bots = [];
  const aliveMeshes = [];

  function buildMesh(bot) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.05;
    torso.userData.part = 'torso';
    torso.userData.bot = bot;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.62;
    head.userData.part = 'head';
    head.userData.bot = bot;
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.63, 0.15);
    const legL = new THREE.Mesh(legGeometry, bodyMaterial);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, bodyMaterial);
    legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.28, 1.05, -0.2);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head, legL, legR, gun };
  }

  for (let i = 0; i < 5; i += 1) {
    const bot = {
      id: i,
      name: BOT_NAMES[i],
      body: createBody(0, -13, 1.72, 1.6),
      health: BOT_HEALTH,
      alive: true,
      state: 'route', // route | hold | engage | defuse | dead
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      targetNode: HOLD_NODES[i],
      seenAt: -10,
      lastKnown: new THREE.Vector3(),
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      shootCooldown: 0,
      strafeDir: 1,
      strafeUntil: 0,
      defuseProgress: 0,
      spikeTarget: -1,
      walkPhase: random() * Math.PI * 2,
      heardAt: -10,
      heardPosition: new THREE.Vector3(),
    };
    bot.mesh = buildMesh(bot);
    bots.push(bot);
    aliveMeshes.push(bot.mesh.torso, bot.mesh.head);
  }

  function placeAtSpawn() {
    defuser = null;
    const spawn = world.defenderSpawn;
    for (const bot of bots) {
      const offset = (bot.id - 2) * 1.1;
      bot.body.position.set(spawn.x + offset, 0, spawn.z + (bot.id % 2) * 1.2);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = 0;
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.state = 'route';
      bot.defuseProgress = 0;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, 0, 0);
      bot.mesh.group.position.copy(bot.body.position);
      bot.targetNode = HOLD_NODES[bot.id];
      bot.path = world.findPath(world.nearestNode(bot.body.position.x, bot.body.position.z), bot.targetNode);
      bot.pathIndex = 0;
      bot.spikeTarget = -1;
      bot.seenAt = -10;
      bot.heardAt = -10;
    }
  }

  function canSee(bot, playerPosition, playerCrouching, time) {
    const eye = new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.6, bot.body.position.z);
    const target = new THREE.Vector3(
      playerPosition.x,
      playerPosition.y + (playerCrouching ? 0.9 : 1.3),
      playerPosition.z,
    );
    const distance = eye.distanceTo(target);
    const rangeLimit = SEE_RANGE * (playerCrouching ? 0.75 : 1);
    if (distance > rangeLimit) return false;
    // Field of view: 100 degrees around the bot's facing, wider up close.
    const facing = new THREE.Vector3(-Math.sin(bot.body.yaw), 0, -Math.cos(bot.body.yaw));
    const toPlayer = target.clone().sub(eye).setY(0).normalize();
    const cosAngle = facing.dot(toPlayer);
    if (cosAngle < (distance < 6 ? -0.2 : 0.15)) return false;
    if (world.losBlocked(eye.x, eye.y, eye.z, target.x, target.y, target.z)) return false;
    return true;
  }

  function aimError(bot, distance, targetSpeed) {
    // Bots miss on purpose: error grows with distance and target speed, shrinks when
    // the target stands still or the bot has been aiming a while.
    const base = 0.02 + distance * 0.0011 + targetSpeed * 0.004;
    return base;
  }

  function fireAt(bot, player, time, random, onShot) {
    if (bot.shootCooldown > 0) return;
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) return;
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.burstPause = 0.45 + random() * 0.5;
    }
    bot.burstLeft -= 1;
    bot.shootCooldown = 0.13 + random() * 0.05;
    if (bot.burstLeft === 0) bot.burstPause = 0.45 + random() * 0.5;

    const from = new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.45, bot.body.position.z);
    const playerBody = player.state;
    const distance = from.distanceTo(new THREE.Vector3(playerBody.position.x, playerBody.position.y + 1.3, playerBody.position.z));
    const aimPoint = new THREE.Vector3(
      playerBody.position.x,
      playerBody.position.y + (random() < 0.22 ? 1.55 : 1.2),
      playerBody.position.z,
    );
    const error = aimError(bot, distance, groundSpeed(playerBody));
    aimPoint.x += (random() * 2 - 1) * error * distance;
    aimPoint.y += (random() * 2 - 1) * error * distance * 0.7;
    aimPoint.z += (random() * 2 - 1) * error * distance;
    const direction = aimPoint.sub(from).normalize();
    onShot(bot, from, direction, distance);
  }

  function stepBot(bot, dt, time, player, spike, random, events) {
    if (!bot.alive) return;
    const playerBody = player.state;
    const playerPosition = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
    const distanceToPlayer = Math.hypot(
      playerPosition.x - bot.body.position.x,
      playerPosition.z - bot.body.position.z,
    );

    // Perception: seeing the player starts a reaction clock; hearing a shot sends
    // the bot to investigate the sound.
    const spikePlanted = spike.state.mode === 'planted';
    const seen = canSee(bot, playerPosition, playerBody.crouching, time);
    if (seen) {
      if (time - bot.seenAt > 0.5) {
        bot.reactAt = time + REACT_BASE + distanceToPlayer * REACT_PER_METER + random() * 0.15;
      }
      bot.seenAt = time;
      bot.lastKnown.copy(playerPosition);
    }
    // Engaging is for defence. Once the spike is planted the objective outranks
    // it: the bot converges on the site instead of chasing the player.
    if (!spikePlanted && time - bot.seenAt < 2.5 && time >= bot.reactAt && bot.state !== 'defuse') {
      bot.state = 'engage';
    } else if (bot.state === 'engage' && time - bot.seenAt >= 2.5) {
      bot.state = 'route';
      if (spikePlanted) {
        bot.spikeTarget = world.nearestNode(spike.position.x, spike.position.z);
        bot.targetNode = bot.spikeTarget;
      } else {
        bot.targetNode = world.nearestNode(bot.lastKnown.x, bot.lastKnown.z);
      }
      bot.path = world.findPath(world.nearestNode(bot.body.position.x, bot.body.position.z), bot.targetNode);
      bot.pathIndex = 0;
    }

    // The planted spike overrides everything: converge, then defuse. The path is
    // only recomputed when the target node changes — recomputing it every step
    // would reset the walk and the bot would never arrive.
    if (spikePlanted) {
      const spikePosition = spike.position;
      const distanceToSpike = Math.hypot(spikePosition.x - bot.body.position.x, spikePosition.z - bot.body.position.z);
      if (distanceToSpike < 2.2) {
        // One bot defuses; the rest hold nearby and cover it. Without this the
        // whole team stacks on the spike and channels at once.
        if (defuser === null) {
          defuser = bot;
          bot.state = 'defuse';
        } else if (defuser === bot) {
          bot.state = 'defuse';
        } else {
          bot.state = 'hold';
          bot.holdUntil = time + 1;
        }
      } else if (bot.state !== 'defuse') {
        const targetNode = world.nearestNode(spikePosition.x, spikePosition.z);
        if (bot.state !== 'route' || bot.spikeTarget !== targetNode) {
          bot.state = 'route';
          bot.spikeTarget = targetNode;
          bot.targetNode = targetNode;
          bot.path = world.findPath(world.nearestNode(bot.body.position.x, bot.body.position.z), targetNode);
          bot.pathIndex = 0;
        }
      }
    } else {
      bot.spikeTarget = -1;
    }

    bot.shootCooldown = Math.max(0, bot.shootCooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);

    let wishX = 0;
    let wishZ = 0;
    let speed = BOT_SPEED;

    if (bot.state === 'defuse') {
      // Stand still and channel. Damage elsewhere interrupts the channel.
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= DEFUSE_SECONDS) {
        events.onDefused(bot);
      }
      // Face the spike.
      const spikePosition = spike.position;
      bot.body.yaw = Math.atan2(-(spikePosition.x - bot.body.position.x), -(spikePosition.z - bot.body.position.z));
    } else if (bot.state === 'engage') {
      // Face the player, strafe sideways, fire in bursts.
      const dx = playerPosition.x - bot.body.position.x;
      const dz = playerPosition.z - bot.body.position.z;
      bot.body.yaw = Math.atan2(-dx, -dz);
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.9 + random() * 1.2;
      }
      if (distanceToPlayer > 14) {
        wishX = -Math.sin(bot.body.yaw);
        wishZ = -Math.cos(bot.body.yaw);
      } else if (distanceToPlayer < 5) {
        wishX = Math.sin(bot.body.yaw);
        wishZ = Math.cos(bot.body.yaw);
      } else {
        wishX = Math.cos(bot.body.yaw) * bot.strafeDir;
        wishZ = -Math.sin(bot.body.yaw) * bot.strafeDir;
      }
      speed = BOT_SPEED * 0.55;
      if (time >= bot.reactAt) fireAt(bot, player, time, random, events.onBotShot);
    } else if (bot.state === 'hold') {
      if (time >= bot.holdUntil) {
        bot.state = 'route';
        bot.targetNode = pick(random, PATROL_NODES);
        bot.path = world.findPath(world.nearestNode(bot.body.position.x, bot.body.position.z), bot.targetNode);
        bot.pathIndex = 0;
      }
      // Scan: slow yaw sweep while holding.
      bot.body.yaw += Math.sin(time * 0.7 + bot.id) * dt * 0.35;
    } else {
      // Route: walk the path node by node.
      if (bot.pathIndex >= bot.path.length) {
        if (spikePlanted) {
          // The path ends at the node nearest the spike; walk the last metres
          // straight to the spike itself so the defuse can start.
          const dx = spike.position.x - bot.body.position.x;
          const dz = spike.position.z - bot.body.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 0.5) {
            wishX = dx / distance;
            wishZ = dz / distance;
            bot.body.yaw = Math.atan2(-dx, -dz);
          }
        } else {
          bot.state = 'hold';
          bot.holdUntil = time + 2.5 + random() * 3;
        }
      } else {
        const node = world.nodePosition(bot.path[bot.pathIndex]);
        const dx = node[0] - bot.body.position.x;
        const dz = node[1] - bot.body.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.7) {
          bot.pathIndex += 1;
        } else {
          wishX = dx / distance;
          wishZ = dz / distance;
          bot.body.yaw = Math.atan2(-dx, -dz);
        }
      }
    }

    // Hearing: a shot the player fired nearby pulls a routing bot to investigate.
    // Never while the spike is planted — the objective outranks curiosity.
    if (!spikePlanted && bot.state === 'route' && time - bot.heardAt < 1.5 && bot.pathIndex >= bot.path.length) {
      bot.targetNode = world.nearestNode(bot.heardPosition.x, bot.heardPosition.z);
      bot.path = world.findPath(world.nearestNode(bot.body.position.x, bot.body.position.z), bot.targetNode);
      bot.pathIndex = 0;
      bot.heardAt = -10;
    }

    stepBody(bot.body, dt, overlaps, wishX, wishZ, speed, 30, 8, false);
    bot.walkPhase += dt * (groundSpeed(bot.body) > 0.5 ? 9 : 0);

    // Sync the visible body: walk bob, legs swing, death fall handled by damage().
    const mesh = bot.mesh;
    mesh.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    mesh.group.rotation.y = bot.body.yaw;
    const swing = Math.sin(bot.walkPhase) * 0.45 * Math.min(1, groundSpeed(bot.body) / BOT_SPEED);
    mesh.legL.rotation.x = swing;
    mesh.legR.rotation.x = -swing;
    mesh.group.position.y = bot.body.position.y + Math.abs(Math.sin(bot.walkPhase)) * 0.04 * Math.min(1, groundSpeed(bot.body) / BOT_SPEED);
  }

  function damage(bot, amount, part, time, playerPosition) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.defuseProgress = 0;
    if (bot.health > 0) {
      // Being shot at snaps the bot's attention to the shooter: it knows where
      // the shot came from and reacts almost at once.
      if (time !== undefined && playerPosition) {
        bot.lastKnown.copy(playerPosition);
        bot.seenAt = time;
        bot.reactAt = time + 0.2;
      }
      return false;
    }
    bot.alive = false;
    bot.state = 'dead';
    bot.mesh.group.rotation.x = -Math.PI / 2;
    bot.mesh.group.position.y = 0.25;
    return true;
  }

  // The bot currently channeling a defuse (null when nobody is). Declared here
  // so step() and stepBot() share it.
  let defuser = null;

  return {
    bots,
    hitMeshes: aliveMeshes,
    placeAtSpawn,
    step(dt, time, player, spike, random, events) {
      // The one bot currently channeling a defuse. Sticky across steps so a
      // second bot arriving later does not steal the channel and reset its
      // progress; it clears when the defuser dies, walks off, or the spike is gone.
      if (defuser) {
        const distance = Math.hypot(defuser.body.position.x - spike.position.x, defuser.body.position.z - spike.position.z);
        if (!defuser.alive || spike.state.mode !== 'planted' || distance > 3) defuser = null;
      }
      for (const bot of bots) stepBot(bot, dt, time, player, spike, random, events);
    },
    damage,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    hearShot(position, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const distance = Math.hypot(position.x - bot.body.position.x, position.z - bot.body.position.z);
        if (distance < HEAR_RANGE) {
          bot.heardAt = time;
          bot.heardPosition.copy(position);
        }
      }
    },
    reset() {
      for (const bot of bots) {
        bot.mesh.group.rotation.set(0, 0, 0);
        bot.mesh.group.visible = true;
      }
      placeAtSpawn();
    },
  };
}
