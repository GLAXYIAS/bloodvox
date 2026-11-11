import * as THREE from 'three';

const _dq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _bounds = new THREE.Box3();

function disposeObject(root) {
  root.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
  });
}

/**
 * Free-tumbling gore: severed limb chains, skull fragments and torn tissue.
 * Each piece is a rigid object with gravity, angular momentum and collisions
 * against the same floor and world AABBs used by the living body solver.
 */
export class Debris {
  constructor(scene, world = null, max = 220) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.max = max;
  }

  add(mesh, {
    velocity,
    spin,
    radius = 0.1,
    restitution = 0.26,
    friction = 0.66,
    gravity = 1,
  } = {}) {
    mesh.traverse?.((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    if (!mesh.parent) this.scene.add(mesh);
    const item = {
      mesh,
      vel: (velocity || new THREE.Vector3()).clone(),
      spin: (spin || new THREE.Vector3()).clone(),
      radius,
      restitution,
      friction,
      gravity,
      settled: false,
      quiet: 0,
    };
    this.items.push(item);

    if (this.items.length > this.max) {
      let idx = this.items.findIndex((it) => it.settled);
      if (idx < 0) idx = 0;
      const [old] = this.items.splice(idx, 1);
      this.scene.remove(old.mesh);
      disposeObject(old.mesh);
    }
    return item;
  }

  clear() {
    for (const it of this.items) {
      if (it.mesh.parent) this.scene.remove(it.mesh);
      disposeObject(it.mesh);
    }
    this.items.length = 0;
  }

  /** One collision pass against a sphere-expanded static AABB. */
  collideBox(it, box, step) {
    const p = it.mesh.position;
    const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
    const cy = Math.max(box.min.y, Math.min(p.y, box.max.y));
    const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
    let dx = p.x - cx;
    let dy = p.y - cy;
    let dz = p.z - cz;
    let d2 = dx * dx + dy * dy + dz * dz;
    const r = it.radius;
    if (d2 >= r * r) return false;

    if (d2 < 1e-9) {
      // Deep penetration: eject through the nearest face.
      const px = Math.min(p.x - box.min.x, box.max.x - p.x);
      const py = Math.min(p.y - box.min.y, box.max.y - p.y);
      const pz = Math.min(p.z - box.min.z, box.max.z - p.z);
      if (px <= py && px <= pz) {
        _normal.set(p.x < (box.min.x + box.max.x) * 0.5 ? -1 : 1, 0, 0);
        p.x = p.x < (box.min.x + box.max.x) * 0.5 ? box.min.x - r : box.max.x + r;
      } else if (py <= pz) {
        _normal.set(0, p.y < (box.min.y + box.max.y) * 0.5 ? -1 : 1, 0);
        p.y = p.y < (box.min.y + box.max.y) * 0.5 ? box.min.y - r : box.max.y + r;
      } else {
        _normal.set(0, 0, p.z < (box.min.z + box.max.z) * 0.5 ? -1 : 1);
        p.z = p.z < (box.min.z + box.max.z) * 0.5 ? box.min.z - r : box.max.z + r;
      }
    } else {
      const d = Math.sqrt(d2);
      _normal.set(dx / d, dy / d, dz / d);
      p.addScaledVector(_normal, r - d);
    }

    const vn = it.vel.dot(_normal);
    if (vn < 0) {
      it.vel.addScaledVector(_normal, -(1 + it.restitution) * vn);
      // scrape speed off the tangent instead of allowing perfectly slippery
      // props; the component into the surface has already been reflected.
      _tmp.copy(it.vel).addScaledVector(_normal, -it.vel.dot(_normal));
      it.vel.addScaledVector(_tmp, -Math.min(0.55, it.friction * step * 28));
      it.spin.multiplyScalar(0.82);
    }
    return _normal.y > 0.38;
  }

  update(dt) {
    if (dt <= 0) return;
    const steps = 2;
    const h = dt / steps;
    for (const it of this.items) {
      if (it.settled) continue;
      let supported = false;
      for (let s = 0; s < steps; s++) {
        it.vel.y -= 26 * it.gravity * h;
        it.mesh.position.addScaledVector(it.vel, h);

        const angle = it.spin.length() * h;
        if (angle > 1e-6) {
          _axis.copy(it.spin).normalize();
          _dq.setFromAxisAngle(_axis, angle);
          it.mesh.quaternion.premultiply(_dq);
        }

        const boxes = this.world?.boxes;
        if (boxes) {
          for (let i = 0; i < boxes.length; i++) {
            if (this.collideBox(it, boxes[i], h)) supported = true;
          }
        }
      }

      // Use the object's actual oriented bounds for the floor, not a sphere
      // around its centre. Long limbs can then lie flat without hanging in the
      // air, while irregular skull and tissue chunks still find a stable pose.
      _bounds.setFromObject(it.mesh);
      if (_bounds.min.y < 0) {
        it.mesh.position.y -= _bounds.min.y;
        supported = true;
        if (it.vel.y < -1.25) {
          it.vel.y *= -it.restitution;
          it.vel.x *= 1 - it.friction * 0.35;
          it.vel.z *= 1 - it.friction * 0.35;
          it.spin.multiplyScalar(0.7);
        } else {
          it.vel.y = 0;
          const groundDrag = Math.min(1, it.friction * dt * 17);
          it.vel.x *= 1 - groundDrag;
          it.vel.z *= 1 - groundDrag;
          it.spin.multiplyScalar(1 - Math.min(0.85, dt * 16));
        }
      }

      const speedSq = it.vel.lengthSq();
      if (supported && speedSq < 0.035 && it.spin.lengthSq() < 0.09) {
        it.quiet += dt;
        if (it.quiet > 0.32) {
          it.vel.set(0, 0, 0);
          it.spin.set(0, 0, 0);
          it.settled = true;
        }
      } else {
        it.quiet = 0;
      }
    }
  }
}
