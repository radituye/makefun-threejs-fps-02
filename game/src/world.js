// EMBERLINE's map: "Duskworks Yard", an industrial yard at dusk, drawn from scratch.
// A site north-east, B site north-west behind a roofed tunnel, a mid lane between
// them, attacker spawn south, defender spawn north. All cover is axis-aligned boxes
// (and barrel cylinders) so the shared body physics collides with it exactly.
// Waypoints form a graph the bots pathfind over with a breadth-first search.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 5;

// Waypoint nodes: [x, z]. Bots walk node to node; the edges below are the walkable links.
const NODES = [
  [0, 14], // 0 attacker spawn
  [0, 8], // 1 mid south
  [0, 2], // 2 mid doors
  [0, -4], // 3 mid north
  [18, 8], // 4 A long south
  [18, 0], // 5 A long mid
  [18, -6], // 6 A long north
  [16, -9.5], // 7 A site (clear of the site container)
  [-18, 8], // 8 B tunnel south
  [-18, 0], // 9 B tunnel mid
  [-18, -6], // 10 B tunnel north
  [-16, -9.5], // 11 B site (clear of the site container)
  [0, -11.8], // 12 defender spawn (just south of the deck)
  [8, -6], // 13 A connector
  [-8, -6], // 14 B connector
  [-8, 4], // 15 mid west flank
  [8, 4], // 16 mid east flank
  [20, -14], // 17 A site back
  [-20, -14], // 18 B site back
  [-12, 8], // 19 B approach
  [12, 8], // 20 A approach
];

const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 12], [3, 13], [3, 14],
  [1, 15], [1, 16], [15, 14], [16, 13],
  [4, 5], [5, 6], [6, 7], [6, 13], [7, 17], [7, 13],
  [8, 9], [9, 10], [10, 11], [10, 14], [11, 18], [11, 14],
  [0, 4], [0, 8], [4, 16], [8, 15], [12, 13], [12, 14],
  [0, 19], [0, 20], [19, 8], [20, 4], [19, 15], [20, 16],
];

const ADJACENT = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJACENT[a].push(b);
  ADJACENT[b].push(a);
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x1b1723, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3a3049, roughness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x9a4f26, roughness: 0.75, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2e6f6a, roughness: 0.7, metalness: 0.25 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x4a5468, roughness: 0.8, metalness: 0.15 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x5a5a62, roughness: 0.95 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x7a3a1e, roughness: 0.6, metalness: 0.4 }),
    amberGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    tealGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ash) }),
    dark: new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 1 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter. The yard is 44 x 34 m, walls 5 m high, open to the dusk sky.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(44.6, 34.6), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-22.3, -0.4, -17.3), new THREE.Vector3(22.3, 0, 17.3)));

  box(44.6, WALL_H, 0.6, 0, WALL_H / 2, -17.3, 'wall');
  box(44.6, WALL_H, 0.6, 0, WALL_H / 2, 17.3, 'wall');
  box(0.6, WALL_H, 34.6, -22.3, WALL_H / 2, 0, 'wall');
  box(0.6, WALL_H, 34.6, 22.3, WALL_H / 2, 0, 'wall');
  // Amber trim strip along the wall tops, so the yard's edge reads at a glance.
  box(44.6, 0.12, 0.12, 0, WALL_H + 0.02, -17.0, 'amberGlow', false);
  box(44.6, 0.12, 0.12, 0, WALL_H + 0.02, 17.0, 'amberGlow', false);
  box(0.12, 0.12, 34.6, -22.0, WALL_H + 0.02, 0, 'amberGlow', false);
  box(0.12, 0.12, 34.6, 22.0, WALL_H + 0.02, 0, 'amberGlow', false);

  // Painted lane markings on the ground: amber down A long, teal through B tunnel.
  function strip(w, d, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const amberLine = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.35 });
  const tealLine = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ash), transparent: true, opacity: 0.35 });
  strip(0.35, 20, 18.5, 2, amberLine);
  strip(0.35, 20, -18.5, 2, tealLine);
  strip(0.35, 12, 0, 8, amberLine);

  // --- Mid: a container stack splits the lane, crates to crouch behind.
  box(6, 2.6, 2.4, 0, 1.3, -2, 'teal');
  box(3, 2.6, 2.4, -0.6, 3.9, -2, 'rust');
  box(1.1, 1.1, 1.1, -2.5, 0.55, 5, 'wood');
  box(1.1, 1.1, 1.1, 2.5, 0.55, 5, 'wood');
  box(3, 1.2, 0.6, 0, 0.6, -7, 'concrete');

  // --- A long (east lane): a rust container, crates, a barrier at the site mouth.
  box(2.4, 2.6, 6, 18.5, 1.3, 4, 'rust');
  box(1.1, 1.1, 1.1, 17, 0.55, -2, 'wood');
  box(1.1, 1.1, 1.1, 19.5, 0.55, -2, 'wood');
  box(1.1, 1.1, 1.1, 19.5, 1.65, -2, 'wood');
  box(3, 1.2, 0.6, 18, 0.6, -10, 'concrete');

  // --- A site: teal container, stacked crates, barrels.
  box(6, 2.6, 2.4, 14, 1.3, -13, 'teal');
  box(1.1, 1.1, 1.1, 19.5, 0.55, -13, 'wood');
  box(1.1, 1.1, 1.1, 19.5, 1.65, -13, 'wood');
  cylinder(0.45, 1.1, 13, 0.55, -9.5, 'barrel');
  cylinder(0.45, 1.1, 14, 0.55, -9.2, 'barrel');

  // --- B tunnel (west lane): roofed corridor, inner wall in two segments.
  box(6, 0.4, 16, -18, 3.1, 0, 'slate');
  box(1, 3, 5, -15.5, 1.5, -5.5, 'concrete');
  box(1, 3, 5, -15.5, 1.5, 5.5, 'concrete');
  box(1.1, 1.1, 1.1, -18.5, 0.55, 2, 'wood');
  box(1.1, 1.1, 1.1, -18.5, 0.55, -4, 'wood');

  // --- B site: rust container, stacked crates, barrels.
  box(6, 2.6, 2.4, -14, 1.3, -13, 'rust');
  box(1.1, 1.1, 1.1, -19.5, 0.55, -13, 'wood');
  box(1.1, 1.1, 1.1, -19.5, 1.65, -13, 'wood');
  cylinder(0.45, 1.1, -13, 0.55, -9.5, 'barrel');
  cylinder(0.45, 1.1, -14, 0.55, -9.2, 'barrel');

  // --- Defender spawn: low deck with a step, barriers facing mid.
  box(4, 0.9, 2, 0, 0.45, -13.5, 'concrete');
  box(4, 0.45, 1, 0, 0.225, -12, 'concrete');
  box(2, 1.2, 0.6, -3, 0.6, -11, 'concrete');
  box(2, 1.2, 0.6, 3, 0.6, -11, 'concrete');

  // --- Attacker spawn: crates and a barrier.
  box(1.1, 1.1, 1.1, -6, 0.55, 12, 'wood');
  box(1.1, 1.1, 1.1, 6, 0.55, 12, 'wood');
  box(4, 1.2, 0.6, 0, 0.6, 10, 'concrete');

  // Pipes along the east wall, high enough to walk under.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 20, 10), mat.slate);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(21.6, 3.6, 0);
  pipe.castShadow = true;
  group.add(pipe);

  // Floodlight poles in the corners, heads glowing amber.
  for (const [x, z] of [[-20, 15], [20, 15], [-20, -15], [20, -15]]) {
    cylinder(0.09, 6, x, 3, z, 'slate', 8);
    box(0.5, 0.3, 0.3, x, 6.1, z, 'amberGlow', false);
  }

  // Cooling tower silhouette outside the north wall, and a skyline beyond the yard.
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6, 14, 18, 1, true), mat.dark);
  tower.position.set(-6, 7, -28);
  group.add(tower);
  const skyline = [[-30, -30, 8, 12], [8, -32, 10, 16], [24, -26, 7, 9], [-14, 28, 9, 11], [16, 30, 8, 14], [34, 6, 9, 13], [-34, 4, 8, 10]];
  for (const [x, z, w, h] of skyline) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat.dark);
    slab.position.set(x, h / 2, z);
    group.add(slab);
  }

  // Floating site letters, drawn on a canvas at runtime — no image files shipped.
  function siteMarker(letter, x, z, color) {
    const texture = letterTexture(letter, color);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), material);
    plane.position.set(x, 4.2, z);
    group.add(plane);
    return plane;
  }
  const markerA = siteMarker('A', 16, -12, PALETTE.accent);
  const markerB = siteMarker('B', -16, -12, PALETTE.ash);

  // Light: a low amber sun from the south-west, a cool violet sky, site lamps.
  const sky = new THREE.HemisphereLight(0x8a7bb8, 0x1a1410, 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffb45e, 2.4);
  sun.position.set(-14, 10, 18);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const lampA = new THREE.PointLight(0xf5a02c, 22, 16, 1.8);
  lampA.position.set(16, 4.5, -12);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x6fc2b4, 22, 16, 1.8);
  lampB.position.set(-16, 4.5, -12);
  scene.add(lampB);
  const lampMid = new THREE.PointLight(0xffb45e, 12, 12, 1.8);
  lampMid.position.set(0, 5, 2);
  scene.add(lampMid);

  const sites = {
    A: new THREE.Box3(new THREE.Vector3(12, 0, -16), new THREE.Vector3(21, 4, -8)),
    B: new THREE.Box3(new THREE.Vector3(-21, 0, -16), new THREE.Vector3(-12, 4, -8)),
  };

  // Slab ray vs AABB test: does the segment from a to b cross any collider?
  const direction = new THREE.Vector3();
  function losBlocked(ax, ay, az, bx, by, bz) {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    if (length < 0.001) return false;
    direction.divideScalar(length);
    const ray = new THREE.Ray(new THREE.Vector3(ax, ay, az), direction);
    const point = new THREE.Vector3();
    for (const collider of colliders) {
      if (ray.intersectBox(collider, point) !== null) {
        const hitDistance = point.distanceTo(ray.origin);
        if (hitDistance < length - 0.05) return true;
      }
    }
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const dx = NODES[i][0] - x;
      const dz = NODES[i][1] - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    const previous = new Array(NODES.length).fill(-1);
    const queue = [from];
    previous[from] = from;
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of ADJACENT[current]) {
        if (previous[next] !== -1) continue;
        previous[next] = current;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) {
            node = previous[node];
            path.unshift(node);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  function insideSite(x, z) {
    if (x >= 12 && x <= 21 && z >= -16 && z <= -8) return 'A';
    if (x >= -21 && x <= -12 && z >= -16 && z <= -8) return 'B';
    return null;
  }

  return {
    colliders,
    shootables,
    group,
    sites,
    markers: { A: markerA, B: markerB },
    attackerSpawn: new THREE.Vector3(0, 0, 14),
    defenderSpawn: new THREE.Vector3(0, 0, -11.5),
    nodePosition(index) {
      return NODES[index];
    },
    nodeCount: NODES.length,
    nearestNode,
    findPath,
    insideSite,
    losBlocked,
    siteCenter(site) {
      return site === 'A' ? new THREE.Vector3(16.5, 0, -12) : new THREE.Vector3(-16.5, 0, -12);
    },
  };
}
