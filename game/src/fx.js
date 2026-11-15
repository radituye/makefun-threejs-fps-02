// Battle feedback: tracers, impact sparks, explosions and the camera shake that
// sells them. Everything here is pooled and reused — no new objects are made in
// the hot loops — and every effect fades out on its own so the caller never has
// to clean up after it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 10;
const SPARK_POINTS = 14;

export function createFx(scene, camera) {
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent),
    size: 0.12,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const points = new THREE.Points(geometry, sparkMaterial.clone());
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, velocities: new Float32Array(SPARK_POINTS * 3), life: 0 });
  }
  let sparkIndex = 0;

  const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22, 1.6);
  scene.add(explosionLight);
  const explosionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  explosionMesh.visible = false;
  scene.add(explosionMesh);
  let explosionLife = 0;

  let shake = 0;

  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();

  return {
    tracer(from, to) {
      const tracer = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
      direction.copy(to).sub(from);
      const length = direction.length();
      if (length < 0.1) return;
      midpoint.copy(from).add(to).multiplyScalar(0.5);
      tracer.mesh.position.copy(midpoint);
      tracer.mesh.lookAt(to);
      tracer.mesh.scale.set(1, 1, length);
      tracer.mesh.material.opacity = 0.9;
      tracer.mesh.visible = true;
      tracer.life = 0.07;
    },
    impact(point, normal) {
      const spark = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      const positions = spark.points.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
        // Sparks fly out along the surface normal, with a random sideways kick.
        spark.velocities[i * 3] = normal.x * 2.2 + (Math.random() * 2 - 1) * 2.4;
        spark.velocities[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.6 + 0.8;
        spark.velocities[i * 3 + 2] = normal.z * 2.2 + (Math.random() * 2 - 1) * 2.4;
      }
      spark.points.geometry.attributes.position.needsUpdate = true;
      spark.points.material.opacity = 0.95;
      spark.points.visible = true;
      spark.life = 0.35;
    },
    explosion(point) {
      explosionMesh.position.copy(point);
      explosionMesh.visible = true;
      explosionLife = 0.55;
      explosionLight.position.copy(point).y += 1;
      explosionLight.intensity = 120;
      shake = Math.max(shake, 0.5);
    },
    addShake(amount) {
      shake = Math.min(1, shake + amount);
    },
    step(dt) {
      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
        if (tracer.life <= 0) tracer.mesh.visible = false;
      }
      for (const spark of sparks) {
        if (spark.life <= 0) continue;
        spark.life -= dt;
        const positions = spark.points.geometry.attributes.position.array;
        for (let i = 0; i < SPARK_POINTS; i += 1) {
          spark.velocities[i * 3 + 1] -= 9 * dt;
          positions[i * 3] += spark.velocities[i * 3] * dt;
          positions[i * 3 + 1] += spark.velocities[i * 3 + 1] * dt;
          positions[i * 3 + 2] += spark.velocities[i * 3 + 2] * dt;
        }
        spark.points.geometry.attributes.position.needsUpdate = true;
        spark.points.material.opacity = Math.max(0, spark.life / 0.35) * 0.95;
        if (spark.life <= 0) spark.points.visible = false;
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        const progress = 1 - Math.max(0, explosionLife) / 0.55;
        const radius = 0.6 + progress * 6.5;
        explosionMesh.scale.setScalar(radius);
        explosionMesh.material.opacity = Math.max(0, 0.75 * (1 - progress));
        explosionLight.intensity = 120 * (1 - progress);
        if (explosionLife <= 0) {
          explosionMesh.visible = false;
          explosionLight.intensity = 0;
        }
      }
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.8);
        const amount = shake * shake * 0.05;
        camera.position.x += (Math.random() * 2 - 1) * amount;
        camera.position.y += (Math.random() * 2 - 1) * amount;
      }
    },
  };
}
