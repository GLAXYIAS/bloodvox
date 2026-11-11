import * as THREE from 'three';

/**
 * Anatomical skeleton for the existing voxel humanoid.
 *
 * These bones are not a second animation rig. They are attached to the current
 * solver-driven part meshes, so they follow every physical reaction, limb
 * detachment and ragdoll pose. Each bone has a local collision volume used by
 * projectile hit resolution and its own structural health. Damage is folded
 * back into the existing limb-strength / balance controller.
 *
 * Coordinates are local to the owning voxel part. For limb meshes local +Y runs
 * from the proximal joint to the distal joint.
 */

const BONE_MAT = new THREE.MeshLambertMaterial({
  color: 0xd2c3a2,
  flatShading: true,
});

const CARTILAGE_MAT = new THREE.MeshLambertMaterial({
  color: 0xb9ad91,
  flatShading: true,
});

// Common shape constructor. Small geometry, because these are mostly seen
// through the holes left by bullets and blades.
function makeBoneMesh(spec) {
  let geometry;
  if (spec.shape === 'long') {
    geometry = new THREE.CylinderGeometry(
      spec.radius * 0.9,
      spec.radius,
      spec.length || 0.2,
      5,
    );
  } else if (spec.shape === 'round') {
    geometry = new THREE.SphereGeometry(spec.radius || 0.06, 6, 4);
  } else if (spec.shape === 'box') {
    const s = spec.size || [0.1, 0.04, 0.04];
    geometry = new THREE.BoxGeometry(s[0], s[1], s[2]);
  } else {
    geometry = new THREE.BoxGeometry(0.08, 0.04, 0.08);
  }
  const material = spec.cartilage ? CARTILAGE_MAT : BONE_MAT;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.position.fromArray(spec.pos || [0, 0, 0]);
  if (spec.rot) mesh.rotation.fromArray(spec.rot);
  return mesh;
}

function mirrorX(spec) {
  return {
    ...spec,
    id: spec.id.replace(/L(?=\d|$)/, 'R'),
    label: spec.label.replace(/LEFT/g, 'RIGHT'),
    // The mirrored bone must move to the mirrored voxel part as well. The old
    // helper changed the id but left every right-arm and right-leg bone parented
    // to its left counterpart, so right-side shots found no bone at all.
    part: spec.part.replace(/L$/, 'R'),
    side: 1,
    pos: [-(spec.pos?.[0] || 0), spec.pos?.[1] || 0, spec.pos?.[2] || 0],
    rot: spec.rot ? [spec.rot[0], -spec.rot[1], -spec.rot[2]] : undefined,
  };
}

const LEFT_SPECS = [
  // --- head and axial skeleton ---
  {
    id: 'skull',
    label: 'SKULL',
    part: 'head',
    pos: [0, 0.015, 0.01],
    shape: 'round',
    radius: 0.095,
    hp: 34,
    role: 'head',
    functional: true,
  },
  {
    id: 'jaw',
    label: 'MANDIBLE',
    part: 'head',
    pos: [0, -0.085, 0.065],
    shape: 'box',
    size: [0.145, 0.045, 0.105],
    hp: 16,
    role: 'jaw',
    side: 0,
    functional: true,
  },
  {
    id: 'cervicalSpine',
    label: 'CERVICAL SPINE',
    part: 'neck',
    pos: [0, 0, 0],
    shape: 'long',
    radius: 0.028,
    length: 0.16,
    hp: 24,
    role: 'neck',
    functional: true,
  },
  {
    id: 'thoracicSpine',
    label: 'THORACIC SPINE',
    part: 'torso',
    // The torso mesh is 0.54 m tall, so the old 0.27 m cylinder at y=0.17
    // pushed its top through the collar of the voxel body. Keep the whole
    // vertebra stack inside the chest silhouette.
    pos: [0, 0.035, -0.055],
    shape: 'long',
    radius: 0.035,
    length: 0.22,
    hp: 36,
    role: 'spine',
    functional: true,
  },
  {
    id: 'lumbarSpine',
    label: 'LUMBAR SPINE',
    part: 'torso',
    pos: [0, -0.12, -0.035],
    shape: 'long',
    radius: 0.035,
    length: 0.24,
    hp: 32,
    role: 'spine',
    functional: true,
  },
  {
    id: 'ribcage',
    label: 'RIB CAGE',
    part: 'torso',
    // The chest is only 0.24 m deep. A 0.12 m sphere on the centreline was
    // mathematically tangent to the front face and could poke through when
    // combined with the voxel grid. Keep a small clearance.
    pos: [0, 0.07, -0.005],
    shape: 'round',
    radius: 0.105,
    hp: 44,
    role: 'ribs',
    functional: true,
  },
  {
    id: 'sternum',
    label: 'STERNUM',
    part: 'torso',
    pos: [0, 0.10, 0.092],
    shape: 'box',
    size: [0.095, 0.17, 0.026],
    hp: 18,
    role: 'ribs',
    functional: true,
  },
  {
    id: 'pelvisBone',
    label: 'PELVIC GIRDLE',
    part: 'torso',
    // Local -0.28 was below the bottom of the 0.54 m torso mesh; this was one
    // of the bones that could be seen at spawn before any wound existed.
    pos: [0, -0.19, 0],
    shape: 'round',
    radius: 0.095,
    hp: 30,
    role: 'pelvis',
    functional: true,
  },
  {
    id: 'sacrum',
    label: 'SACRUM',
    part: 'torso',
    pos: [0, -0.16, -0.07],
    shape: 'box',
    size: [0.13, 0.14, 0.035],
    hp: 22,
    role: 'pelvis',
    functional: true,
  },
  // Six visible rib arches. They are structural but distributed across the
  // torso, so one broken arch does not disable the entire ribcage.
  ...[0, 1, 2].map((i) => ({
    id: `ribL${i + 1}`,
    label: `LEFT RIB ${i + 1}`,
    part: 'torso',
    pos: [-0.095, 0.15 - i * 0.065, 0.012],
    shape: 'box',
    size: [0.15, 0.015, 0.15],
    rot: [0, 0.13 + i * 0.03, 0.08],
    hp: 10,
    role: 'ribs',
    side: -1,
    functional: true,
  })),
  // --- shoulder girdle and arm ---
  {
    id: 'clavicleL',
    label: 'LEFT CLAVICLE',
    part: 'torso',
    // 0.29 was above the top face of the torso (half-height 0.27). This was
    // the piece most often visible at the chest before any damage.
    pos: [-0.115, 0.195, 0.035],
    shape: 'box',
    size: [0.15, 0.026, 0.026],
    rot: [0, 0, -0.12],
    hp: 14,
    role: 'shoulder',
    side: -1,
    functional: true,
  },
  {
    id: 'scapulaL',
    label: 'LEFT SCAPULA',
    part: 'torso',
    pos: [-0.145, 0.185, -0.082],
    shape: 'box',
    size: [0.09, 0.13, 0.025],
    rot: [0, 0.12, 0],
    hp: 18,
    role: 'shoulder',
    side: -1,
    functional: true,
  },
  {
    id: 'humerusL',
    label: 'LEFT HUMERUS',
    part: 'upperArmL',
    pos: [0, 0, 0],
    shape: 'long',
    radius: 0.032,
    length: 0.24,
    hp: 26,
    role: 'arm',
    side: -1,
    functional: true,
  },
  {
    id: 'radiusL',
    label: 'LEFT RADIUS',
    part: 'forearmL',
    pos: [-0.014, -0.01, 0.018],
    shape: 'long',
    radius: 0.018,
    length: 0.23,
    hp: 15,
    role: 'arm',
    side: -1,
    functional: true,
  },
  {
    id: 'ulnaL',
    label: 'LEFT ULNA',
    part: 'forearmL',
    pos: [0.014, -0.01, -0.018],
    shape: 'long',
    radius: 0.016,
    length: 0.23,
    hp: 15,
    role: 'arm',
    side: -1,
    functional: true,
  },
  // --- lower limb ---
  {
    id: 'femurL',
    label: 'LEFT FEMUR',
    part: 'thighL',
    pos: [0, 0, 0],
    shape: 'long',
    radius: 0.038,
    length: 0.30,
    hp: 34,
    role: 'leg',
    side: -1,
    functional: true,
  },
  {
    id: 'patellaL',
    label: 'LEFT PATELLA',
    part: 'thighL',
    pos: [0, -0.17, 0.055],
    shape: 'round',
    radius: 0.034,
    hp: 9,
    role: 'knee',
    side: -1,
    functional: true,
  },
  {
    id: 'tibiaL',
    label: 'LEFT TIBIA',
    part: 'shinL',
    pos: [0, -0.01, 0.018],
    shape: 'long',
    radius: 0.026,
    length: 0.26,
    hp: 24,
    role: 'leg',
    side: -1,
    functional: true,
  },
  {
    id: 'fibulaL',
    label: 'LEFT FIBULA',
    part: 'shinL',
    pos: [-0.025, -0.025, -0.025],
    shape: 'long',
    radius: 0.013,
    length: 0.24,
    hp: 13,
    role: 'leg',
    side: -1,
    functional: true,
  },
  {
    id: 'calcaneusL',
    label: 'LEFT CALCANEUS',
    part: 'footL',
    pos: [0, -0.005, -0.045],
    shape: 'box',
    size: [0.075, 0.055, 0.12],
    hp: 11,
    role: 'foot',
    side: -1,
    functional: true,
  },
];

export const SKELETON_SPECS = [
  ...LEFT_SPECS,
  ...LEFT_SPECS.filter((spec) => spec.side === -1).map(mirrorX),
];

/**
 * Attach the bones to the already-built voxel part meshes. The bones inherit
 * the part transform, so they remain inside the body during every solver pose.
 */
export function buildSkeleton(npc) {
  npc.skeleton = [];
  for (const spec of SKELETON_SPECS) {
    const part = npc.parts.find((p) => p.name === spec.part);
    if (!part?.mesh) continue;
    const mesh = makeBoneMesh(spec);
    const bone = {
      id: spec.id,
      label: spec.label,
      part,
      mesh,
      role: spec.role || 'tissue',
      side: spec.side || 0,
      functional: spec.functional !== false,
      local: new THREE.Vector3().fromArray(spec.pos || [0, 0, 0]),
      hitRadius: spec.shape === 'long'
        ? Math.max(spec.radius || 0.03, (spec.length || 0.2) * 0.16)
        : spec.shape === 'box'
          ? Math.max(...(spec.size || [0.1, 0.04, 0.04])) * 0.62
          : (spec.radius || 0.06) * 1.15,
      maxHp: spec.hp || 16,
      hp: spec.hp || 16,
      fractured: false,
      broken: false,
      hits: 0,
      damage: 0,
      lastPoint: new THREE.Vector3(),
    };
    mesh.userData.skeletonBone = bone;
    mesh.userData.part = part;
    // Bones are structural and shootable, but they are not decorative. They
    // start hidden inside the intact voxel body and are only exposed when a
    // real wound removes the tissue over them.
    bone.exposed = false;
    mesh.visible = false;
    mesh.renderOrder = 2;
    part.mesh.add(mesh);
    if (!part.skeletonBones) part.skeletonBones = [];
    part.skeletonBones.push(bone);
    npc.skeleton.push(bone);
  }
  return npc.skeleton;
}

/** Structural multiplier used by limb support, arm reach and torso tone. */
/**
 * Expose a bone only when a carved bullet/blade channel actually removed the
 * tissue covering it. Starting every bone hidden is not a cosmetic patch: an
 * intact body has no exposed skeleton, and a bone hit through an intact torso
 * still damages the skeleton without rendering it through the skin.
 */
export function exposeSkeletonBones(part, removed = []) {
  if (!part?.skeletonBones?.length || !removed.length) return;
  for (const bone of part.skeletonBones) {
    if (bone.exposed) continue;
    const reach = bone.hitRadius + 0.052;
    for (let i = 0; i < removed.length; i++) {
      const v = removed[i];
      const dx = v.x - bone.local.x;
      const dy = v.y - bone.local.y;
      const dz = v.z - bone.local.z;
      if (dx * dx + dy * dy + dz * dz <= reach * reach) {
        bone.exposed = true;
        if (bone.mesh) bone.mesh.visible = true;
        break;
      }
    }
  }
}

/** Re-hide the whole skeleton and drop all exposure state (safety filter). */
export function concealSkeleton(npc) {
  for (const bone of npc.skeleton || []) {
    bone.exposed = false;
    if (bone.mesh) bone.mesh.visible = false;
  }
}

export function skeletonBoneWear(bone) {
  if (!bone) return 1;
  if (bone.broken) return 0.22;
  const ratio = Math.max(0, Math.min(1, bone.hp / Math.max(1, bone.maxHp)));
  if (bone.fractured) return 0.42 + ratio * 0.24;
  return 0.72 + ratio * 0.28;
}

/**
 * The nearest bone whose local collision envelope contains the hit point.
 * Projectiles that pass through a carved hole and strike the bone directly also
 * arrive here; there is no separate damage system for the two paths.
 */
export function resolveSkeletonBone(npc, part, localPoint, preferred = null) {
  if (preferred && preferred.part === part && npc.skeleton?.includes(preferred)) return preferred;
  if (!npc.skeleton?.length) return null;
  let best = null;
  let nearest = null;
  let bestDistance = Infinity;
  let nearestDistance = Infinity;
  for (const bone of npc.skeleton) {
    if (bone.part !== part) continue;
    const dx = localPoint.x - bone.local.x;
    const dy = localPoint.y - bone.local.y;
    const dz = localPoint.z - bone.local.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < nearestDistance) {
      nearest = bone;
      nearestDistance = distance;
    }
    // Larger bones should win when the point lies inside the ribcage or
    // skull, but a tibia remains reachable through a small shin wound.
    const reach = bone.hitRadius + 0.045;
    if (distance > reach) continue;
    const score = distance - Math.min(0.025, bone.hitRadius * 0.2);
    if (score < bestDistance) {
      best = bone;
      bestDistance = score;
    }
  }
  if (best) return best;
  // A hit on the flesh over a bone still transmits load into that bone. The
  // nearest bone in the same part is used as an indirect structural hit when
  // the entry point is just outside its exact collision envelope (for example
  // the cervical vertebra behind a thin neck). This prevents the skeleton from
  // existing only when a hole happens to line up with a bone.
  const maxIndirect = Math.max(0.11, Math.min(0.3, Math.max(...(part.size || [0.2, 0.2, 0.2])) * 0.48));
  return nearest && nearestDistance <= maxIndirect ? nearest : null;
}

/** Damage the selected bone and expose fracture state for the controller. */
export function damageSkeletonBone(bone, amount, dir = null, point = null) {
  if (!bone || !(amount > 0)) return;
  bone.hits += 1;
  bone.damage += amount;
  let effective = amount * (bone.role === 'ribs' ? 0.55 : bone.role === 'spine' ? 0.72 : 1);
  // A projectile that only grazes the bone should not fracture it. The local
  // pelvis and spinal bones are deeper and better protected than a rib.
  if (bone.role === 'pelvis') effective *= 0.72;
  bone.hp = Math.max(0, bone.hp - effective);
  const ratio = bone.hp / Math.max(1, bone.maxHp);
  bone.fractured = bone.fractured || ratio < 0.46;
  bone.broken = bone.hp <= 0;
  if (point) bone.lastPoint.copy(point);
  return bone;
}

export function disposeSkeleton(npc) {
  for (const bone of npc.skeleton || []) {
    if (bone.mesh) {
      bone.mesh.geometry.dispose();
      if (bone.mesh.parent) bone.mesh.parent.remove(bone.mesh);
      bone.mesh = null;
    }
  }
  npc.skeleton = [];
}

export { BONE_MAT };
