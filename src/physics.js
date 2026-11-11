import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Tiny verlet/PBD physics world: particles connected by stiff distance links,
 * colliding with the floor and static AABBs. Used for active NPCs, dead bodies
 * and debris. Links can also carry joint limits (min/max) instead of a rest
 * length, which stops knees and elbows from hyperextending or folding through
 * themselves.
 */
export class PhysicsWorld {
  constructor() {
    this.particles = [];
    this.links = [];
    this.boxes = [];
    this.selfPairs = [];
    this.capsules = [];
    this.gravity = -26;
    this.damping = 0.995;
    this.groundFriction = 0.7;
    this.iterations = 10;
  }

  addParticle(position, radius = 0.06, invMass = 1) {
    const p = {
      position: position.clone(),
      prev: position.clone(),
      radius,
      invMass,
      kinematic: invMass === 0,
      alive: true,
    };
    this.particles.push(p);
    return p;
  }

  /**
   * Two bones that must not occupy the same space. Distance links preserve
   * bone length, but without this pass a head can be driven through a ribcage
   * or an arm through a torso and still satisfy every link. `scale` lets a
   * body use a slightly tighter radius than its broad kinematic collider so
   * shoulders and hips can still articulate naturally.
   */
  addSelfCollision(a, b, scale = 0.66) {
    const pair = {
      a,
      b,
      min: (a.radius + b.radius) * scale,
      enabled: true,
    };
    this.selfPairs.push(pair);
    return pair;
  }

  /**
   * Capsule-versus-capsule collision for articulated limbs. A single sphere at
   * each joint leaves the segment between two joints free to sweep through the
   * torso; these pairs stop the whole forearm, thigh or head volume, not just
   * its end points. `clearance` is the minimum surface gap.
   */
  addCapsuleCollision(a1, a2, b1, b2, clearance = 0.055, stiffness = 0.78) {
    const cap = { a1, a2, b1, b2, clearance, stiffness, enabled: true };
    this.capsules.push(cap);
    return cap;
  }

  addLink(a, b, stiffness = 1) {
    const link = {
      a,
      b,
      stiffness,
      rest: a.position.distanceTo(b.position),
      enabled: false,
      cut: false,
      min: null,
      max: null,
      limit: false,
    };
    this.links.push(link);
    return link;
  }

  /**
   * Constrain motion of b relative to a along one rotating body axis. Distance
   * links preserve segment lengths but cannot stop a hip or shoulder opening
   * past its anatomical range when wounds and impulses accumulate. The axis is
   * a live vector because the body turns.
   */
  addAxisLimit(a, b, axis, min, max, stiffness = 0.82) {
    const limit = {
      a,
      b,
      axis,
      min,
      max,
      rest: 0,
      stiffness,
      enabled: false,
      cut: false,
      axisLimit: true,
    };
    this.links.push(limit);
    return limit;
  }

  /** Radial impulse: shoves nearby particles (and therefore the ragdoll). */
  impulse(point, dir, force, radius = 1.1) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive || p.kinematic) continue;
      const d = p.position.distanceTo(point);
      if (d >= radius) continue;
      const fall = 1 - d / radius;
      p.prev.addScaledVector(dir, -force * fall * p.invMass);
      p.prev.y -= force * fall * p.invMass * 0.25;
    }
  }

  step(dt) {
    // A single non-finite previous position must not be allowed to become a
    // whole-body explosion. Positions are the authoritative pose; if an
    // external controller corrupts the velocity history, drop that history.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      if (
        Number.isFinite(p.position.x) && Number.isFinite(p.position.y) && Number.isFinite(p.position.z) &&
        (!Number.isFinite(p.prev.x) || !Number.isFinite(p.prev.y) || !Number.isFinite(p.prev.z))
      ) p.prev.copy(p.position);
    }
    const sub = Math.max(2, Math.min(6, Math.ceil(dt / (1 / 120))));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive || p.kinematic) continue;
        const vx = (p.position.x - p.prev.x) * this.damping;
        const vy = (p.position.y - p.prev.y) * this.damping;
        const vz = (p.position.z - p.prev.z) * this.damping;
        p.prev.copy(p.position);
        p.position.x += vx;
        p.position.y += vy + this.gravity * h * h;
        p.position.z += vz;
      }
      for (let it = 0; it < this.iterations; it++) {
        for (let i = 0; i < this.links.length; i++) {
          const l = this.links[i];
          if (!l.enabled || !l.a.alive || !l.b.alive) continue;
          this.solveLink(l);
        }
        // Solid tissue has volume. Resolve non-adjacent bones after the links
        // so elbows, knees and the neck cannot fold through the body under a
        // bullet impulse. These are position constraints, not animation.
        for (let i = 0; i < this.selfPairs.length; i++) {
          const pair = this.selfPairs[i];
          if (!pair.enabled || !pair.a.alive || !pair.b.alive) continue;
          this.solveSelfCollision(pair, it === this.iterations - 1);
        }
        for (let i = 0; i < this.capsules.length; i++) {
          const cap = this.capsules[i];
          if (!cap.enabled || !cap.a1.alive || !cap.a2.alive || !cap.b1.alive || !cap.b2.alive) continue;
          // The last pass is a hard stop. Soft contact during the solve avoids
          // buzzing; the final full correction catches residual interpenetration
          // left by the joint links before the frame is shown.
          this.solveCapsules(cap, it === this.iterations - 1);
        }
      }
      // Muscle servos. These are soft position constraints, not scripted
      // animation: every frame the joint pulls toward a target while inertia,
      // gravity, links and collisions fight back. Strength is expressed in
      // metres of correction per second and can be dialled down as a body tires.
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive || p.kinematic || !(p.motorStrength > 0) || !p.motorTarget) continue;
        const dx = p.motorTarget.x - p.position.x;
        const dy = p.motorTarget.y - p.position.y;
        const dz = p.motorTarget.z - p.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-6) continue;
        // Muscles do two jobs: move the joint toward its motor target and
        // actively damp the velocity that gravity or a bullet gave it. Weak
        // tone leaves both terms small, which is what lets a dying body fall.
        const damp = Math.min(1, p.motorStrength * h * 14);
        const vx = p.position.x - p.prev.x;
        const vy = p.position.y - p.prev.y;
        const vz = p.position.z - p.prev.z;
        p.prev.x += vx * damp;
        p.prev.y += vy * damp;
        p.prev.z += vz * damp;
        const correction = Math.min(dist, p.motorSpeed * h) * Math.min(1, p.motorStrength * h * 50);
        const scale = correction / dist;
        _v.set(dx * scale, dy * scale, dz * scale);
        p.position.add(_v);
        // Carry most of the correction into the next substep so the joint does
        // not buzz, while leaving some spring back into the solver.
        p.prev.addScaledVector(_v, 0.74);
      }
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive || p.kinematic) continue;
        this.collide(p);
      }
    }
  }

  solveSelfCollision(pair, hard = false) {
    const a = pair.a;
    const b = pair.b;
    const wa = a.invMass;
    const wb = b.invMass;
    const sum = wa + wb;
    if (sum <= 0) return;
    _v.subVectors(b.position, a.position);
    const d2 = _v.lengthSq();
    const min = pair.min;
    if (d2 >= min * min) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // Perfectly coincident particles need a deterministic escape axis.
      _v.set(1, 0, 0);
      d = 0;
    } else {
      _v.divideScalar(d);
    }
    // A little less than full correction avoids buzzing against the limited
    // number of solver iterations while still refusing interpenetration.
    const correction = (min - d) * (hard ? 1 : 0.82);
    const ca = correction * (wa / sum);
    const cb = correction * (wb / sum);
    a.position.addScaledVector(_v, -ca);
    b.position.addScaledVector(_v, cb);
    // Constraint corrections are positional. Feeding all of them back into
    // the next Verlet velocity turns every collision into a spring and is a
    // major source of limb buzzing. Carry most of the correction into prev.
    a.prev.addScaledVector(_v, -ca * 0.82);
    b.prev.addScaledVector(_v, cb * 0.82);
  }

  /** Closest points between two line segments, using the standard RTCD solve. */
  solveCapsules(cap, hard = false) {
    const a1 = cap.a1.position;
    const a2 = cap.a2.position;
    const b1 = cap.b1.position;
    const b2 = cap.b2.position;
    const d1x = a2.x - a1.x;
    const d1y = a2.y - a1.y;
    const d1z = a2.z - a1.z;
    const d2x = b2.x - b1.x;
    const d2y = b2.y - b1.y;
    const d2z = b2.z - b1.z;
    const rx = a1.x - b1.x;
    const ry = a1.y - b1.y;
    const rz = a1.z - b1.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s = 0;
    let t = 0;
    if (a > 1e-9 && e > 1e-9) {
      const c = d1x * rx + d1y * ry + d1z * rz;
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      if (denom > 1e-9) s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    } else if (a > 1e-9) {
      s = Math.max(0, Math.min(1, -((rx * d1x + ry * d1y + rz * d1z) / a)));
    } else if (e > 1e-9) {
      t = Math.max(0, Math.min(1, f / e));
    }

    const pax = a1.x + d1x * s;
    const pay = a1.y + d1y * s;
    const paz = a1.z + d1z * s;
    const pbx = b1.x + d2x * t;
    const pby = b1.y + d2y * t;
    const pbz = b1.z + d2z * t;
    let nx = pbx - pax;
    let ny = pby - pay;
    let nz = pbz - paz;
    const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (d >= cap.clearance) return;
    if (d < 1e-6) {
      nx = 1;
      ny = 0;
      nz = 0;
    } else {
      nx /= d;
      ny /= d;
      nz /= d;
    }
    const wa = cap.a1.invMass * (1 - s) + cap.a2.invMass * s;
    const wb = cap.b1.invMass * (1 - t) + cap.b2.invMass * t;
    const wsum = wa + wb;
    if (wsum <= 0) return;
    // A deep penetration is a hard non-penetration constraint, not a soft
    // spring. This is what stops a violent impulse firing a forearm through
    // the ribcage before the next solver iteration can recover it.
    const push = (cap.clearance - d) * (hard || d < cap.clearance * 0.55 ? 1 : cap.stiffness);
    const pa = push * (wa / wsum);
    const pb = push * (wb / wsum);
    const ax1 = -nx * pa * (1 - s);
    const ay1 = -ny * pa * (1 - s);
    const az1 = -nz * pa * (1 - s);
    const ax2 = -nx * pa * s;
    const ay2 = -ny * pa * s;
    const az2 = -nz * pa * s;
    const bx1 = nx * pb * (1 - t);
    const by1 = ny * pb * (1 - t);
    const bz1 = nz * pb * (1 - t);
    const bx2 = nx * pb * t;
    const by2 = ny * pb * t;
    const bz2 = nz * pb * t;
    cap.a1.position.x += ax1; cap.a1.position.y += ay1; cap.a1.position.z += az1;
    cap.a2.position.x += ax2; cap.a2.position.y += ay2; cap.a2.position.z += az2;
    cap.b1.position.x += bx1; cap.b1.position.y += by1; cap.b1.position.z += bz1;
    cap.b2.position.x += bx2; cap.b2.position.y += by2; cap.b2.position.z += bz2;
    cap.a1.prev.x += ax1 * 0.82; cap.a1.prev.y += ay1 * 0.82; cap.a1.prev.z += az1 * 0.82;
    cap.a2.prev.x += ax2 * 0.82; cap.a2.prev.y += ay2 * 0.82; cap.a2.prev.z += az2 * 0.82;
    cap.b1.prev.x += bx1 * 0.82; cap.b1.prev.y += by1 * 0.82; cap.b1.prev.z += bz1 * 0.82;
    cap.b2.prev.x += bx2 * 0.82; cap.b2.prev.y += by2 * 0.82; cap.b2.prev.z += bz2 * 0.82;
  }

  solveAxisLimit(l, a, b) {
    const wa = a.invMass;
    const wb = b.invMass;
    const sum = wa + wb;
    if (sum <= 0) return;
    const axis = l.axis;
    const d =
      (b.position.x - a.position.x) * axis.x +
      (b.position.y - a.position.y) * axis.y +
      (b.position.z - a.position.z) * axis.z;
    const target = d < l.min ? l.min : d > l.max ? l.max : d;
    const correction = (d - target) * l.stiffness;
    if (Math.abs(correction) < 1e-6) return;
    const ax = axis.x * correction;
    const ay = axis.y * correction;
    const az = axis.z * correction;
    a.position.x += ax * (wa / sum);
    a.position.y += ay * (wa / sum);
    a.position.z += az * (wa / sum);
    b.position.x -= ax * (wb / sum);
    b.position.y -= ay * (wb / sum);
    b.position.z -= az * (wb / sum);
    // Damp the corrective velocity as well. Without this the joint oscillates
    // from one side of the limit to the other.
    a.prev.x += ax * (wa / sum) * 0.72;
    a.prev.y += ay * (wa / sum) * 0.72;
    a.prev.z += az * (wa / sum) * 0.72;
    b.prev.x -= ax * (wb / sum) * 0.72;
    b.prev.y -= ay * (wb / sum) * 0.72;
    b.prev.z -= az * (wb / sum) * 0.72;
  }

  solveLink(l) {
    const a = l.a;
    const b = l.b;
    if (l.axisLimit) {
      this.solveAxisLimit(l, a, b);
      return;
    }
    _v.subVectors(b.position, a.position);
    const len = _v.length();
    if (len < 1e-6) return;
    const wa = a.invMass;
    const wb = b.invMass;
    const sum = wa + wb;
    if (sum <= 0) return;

    let target;
    if (l.limit) {
      target = len;
      if (l.min != null && target < l.min) target = l.min;
      if (l.max != null && target > l.max) target = l.max;
      if (target === len) return;
    } else {
      target = l.rest;
    }

    const diff = ((len - target) / len) * l.stiffness;
    const ca = diff * (wa / sum);
    const cb = diff * (wb / sum);
    a.position.addScaledVector(_v, ca);
    b.position.addScaledVector(_v, -cb);
    // Carry the positional correction across frames instead of turning it into
    // reciprocal velocity. This keeps stiff joint limits from buzzing.
    a.prev.addScaledVector(_v, ca * 0.8);
    b.prev.addScaledVector(_v, -cb * 0.8);
  }

  collide(p) {
    const r = p.radius;
    if (p.position.y < r) {
      p.position.y = r;
      const vx = p.position.x - p.prev.x;
      const vz = p.position.z - p.prev.z;
      p.prev.x = p.position.x - vx * this.groundFriction;
      p.prev.z = p.position.z - vz * this.groundFriction;
      if (p.position.y - p.prev.y < 0) p.prev.y = p.position.y;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const cx = Math.max(b.min.x, Math.min(p.position.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.position.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.position.z, b.max.z));
      const dx = p.position.x - cx;
      const dy = p.position.y - cy;
      const dz = p.position.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        p.position.x += dx * push;
        p.position.y += dy * push;
        p.position.z += dz * push;
        p.prev.x += dx * push * 0.6;
        p.prev.z += dz * push * 0.6;
      } else {
        // centre inside the box: eject along the shallowest axis
        const px = Math.min(p.position.x - b.min.x, b.max.x - p.position.x);
        const py = Math.min(p.position.y - b.min.y, b.max.y - p.position.y);
        const pz = Math.min(p.position.z - b.min.z, b.max.z - p.position.z);
        if (px <= py && px <= pz) p.position.x = p.position.x < (b.min.x + b.max.x) / 2 ? b.min.x - r : b.max.x + r;
        else if (py <= pz) p.position.y = p.position.y < (b.min.y + b.max.y) / 2 ? b.min.y - r : b.max.y + r;
        else p.position.z = p.position.z < (b.min.z + b.max.z) / 2 ? b.min.z - r : b.max.z + r;
      }
    }
  }
}
