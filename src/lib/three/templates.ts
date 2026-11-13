import * as THREE from 'three';
import {
  computeAvatarAnatomy,
  sampleLegSection,
  sampleTorsoSection,
  type Avatar3DParams,
} from '@/src/lib/avatar/mapping';
import type { GarmentTemplate3DId } from '@/src/types/models';

export type GarmentLayerKey = 'shoes' | 'bottom' | 'top' | 'dress' | 'outerwear';

export const GARMENT_LAYER_RENDER_ORDER: Record<GarmentLayerKey, number> = {
  shoes: 10,
  bottom: 20,
  top: 30,
  dress: 30,
  outerwear: 40,
};

export const GARMENT_POLYGON_OFFSET: Record<GarmentLayerKey, number> = {
  shoes: -1,
  bottom: -2,
  top: -3,
  dress: -3,
  outerwear: -4,
};

export function getLayerForTemplate(templateId: GarmentTemplate3DId): GarmentLayerKey {
  switch (templateId) {
    case 'shoes':
      return 'shoes';
    case 'pants':
    case 'shorts':
    case 'skirt':
      return 'bottom';
    case 'dress':
      return 'dress';
    case 'jacket':
      return 'outerwear';
    case 'tshirt':
    case 'longsleeve':
    default:
      return 'top';
  }
}

export interface ShellRing {
  y: number;
  rx: number;
  rz: number;
  centerX?: number;
  zOffset?: number;
}

export interface ShellFrontMapping {
  startRingIndex: number;
  endRingIndex: number;
  halfAngleRad: number;
  uMin?: number;
  uMax?: number;
  vMin?: number;
  vMax?: number;
}

/**
 * Construye una malla elíptica continua (40 segmentos radiales por defecto)
 * con normales suavizadas y sin costura trasera. Cuando se especifica `front`,
 * separa los triángulos frontales en el grupo de material 0 (con UVs [0..1] sin
 * estiramiento) y el resto en el grupo 1 (color sólido dominante), eliminando
 * por completo los paneles superpuestos y el z-fighting.
 */
export function createEllipticalShellGeometry(
  rings: ShellRing[],
  options: {
    radialSegments?: number;
    front?: ShellFrontMapping;
  } = {},
): THREE.BufferGeometry {
  const radialSegments = Math.max(32, options.radialSegments ?? 40);
  const ringCount = rings.length;
  const cols = radialSegments + 1;

  const positions = new Float32Array(ringCount * cols * 3);
  const uvs = new Float32Array(ringCount * cols * 2);

  const front = options.front;
  const halfAngle = front?.halfAngleRad ?? Math.PI * 0.3;
  const uMin = front?.uMin ?? 0;
  const uMax = front?.uMax ?? 1;
  const vMin = front?.vMin ?? 0;
  const vMax = front?.vMax ?? 1;

  const yFrontMin = front ? rings[front.startRingIndex].y : rings[0].y;
  const yFrontMax = front ? rings[front.endRingIndex].y : rings[ringCount - 1].y;
  const ySpan = Math.max(1e-4, yFrontMax - yFrontMin);

  for (let j = 0; j < ringCount; j++) {
    const ring = rings[j];
    const cx = ring.centerX ?? 0;
    const cz = ring.zOffset ?? 0;
    const vNorm = THREE.MathUtils.clamp((ring.y - yFrontMin) / ySpan, 0, 1);
    const v = THREE.MathUtils.lerp(vMin, vMax, vNorm);

    for (let i = 0; i <= radialSegments; i++) {
      // theta = -PI .. +PI; theta = 0 está en i = radialSegments / 2 (+Z frente)
      const theta = -Math.PI + (i / radialSegments) * Math.PI * 2;
      const x = cx + ring.rx * Math.sin(theta);
      const z = cz + ring.rz * Math.cos(theta);

      const vIdx = j * cols + i;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = ring.y;
      positions[vIdx * 3 + 2] = z;

      const uNorm = THREE.MathUtils.clamp((theta + halfAngle) / (2 * halfAngle), 0, 1);
      uvs[vIdx * 2] = THREE.MathUtils.lerp(uMin, uMax, uNorm);
      uvs[vIdx * 2 + 1] = v;
    }
  }

  const frontIndices: number[] = [];
  const bodyIndices: number[] = [];

  for (let j = 0; j < ringCount - 1; j++) {
    const inFrontVertical =
      front !== undefined && j >= front.startRingIndex && j < front.endRingIndex;

    for (let i = 0; i < radialSegments; i++) {
      const a = j * cols + i;
      const b = j * cols + i + 1;
      const c = (j + 1) * cols + i + 1;
      const d = (j + 1) * cols + i;

      const thetaA = -Math.PI + (i / radialSegments) * Math.PI * 2;
      const thetaB = -Math.PI + ((i + 1) / radialSegments) * Math.PI * 2;
      const inFrontHorizontal =
        front !== undefined && thetaA >= -halfAngle - 1e-4 && thetaB <= halfAngle + 1e-4;

      const target = inFrontVertical && inFrontHorizontal ? frontIndices : bodyIndices;
      target.push(a, b, c);
      target.push(a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  if (frontIndices.length > 0) {
    const combined = new Uint32Array(frontIndices.length + bodyIndices.length);
    combined.set(frontIndices, 0);
    combined.set(bodyIndices, frontIndices.length);
    geometry.setIndex(new THREE.BufferAttribute(combined, 1));
    geometry.clearGroups();
    geometry.addGroup(0, frontIndices.length, 0);
    geometry.addGroup(frontIndices.length, bodyIndices.length, 1);
  } else {
    geometry.setIndex(bodyIndices);
  }

  geometry.computeVertexNormals();

  // Unificar normales a lo largo de la costura trasera (i = 0 e i = radialSegments)
  const normalAttr = geometry.attributes.normal;
  for (let j = 0; j < ringCount; j++) {
    const i0 = j * cols;
    const iLast = j * cols + radialSegments;
    const nx = (normalAttr.getX(i0) + normalAttr.getX(iLast)) * 0.5;
    const ny = (normalAttr.getY(i0) + normalAttr.getY(iLast)) * 0.5;
    const nz = (normalAttr.getZ(i0) + normalAttr.getZ(iLast)) * 0.5;
    const len = Math.hypot(nx, ny, nz) || 1;
    normalAttr.setXYZ(i0, nx / len, ny / len, nz / len);
    normalAttr.setXYZ(iLast, nx / len, ny / len, nz / len);
  }
  normalAttr.needsUpdate = true;

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Envuelve una secuencia de anillos exteriores con retornos cerrados en dobladillo inferior
 * y borde superior para dar grosor real sin triángulos sueltos ni bordes de papel.
 */
function buildClosedRimRings(
  outerRings: ShellRing[],
  rimThickness: number,
  lipHeight = 0.015,
): { rings: ShellRing[]; startOuterIdx: number; endOuterIdx: number } {
  const first = outerRings[0];
  const last = outerRings[outerRings.length - 1];

  const bottomInner: ShellRing = {
    y: first.y + Math.min(lipHeight, 0.018),
    rx: Math.max(0.015, first.rx - rimThickness),
    rz: Math.max(0.015, first.rz - rimThickness),
    centerX: first.centerX,
    zOffset: first.zOffset,
  };
  const bottomUnder: ShellRing = {
    y: first.y,
    rx: Math.max(0.018, first.rx - rimThickness * 0.45),
    rz: Math.max(0.018, first.rz - rimThickness * 0.45),
    centerX: first.centerX,
    zOffset: first.zOffset,
  };

  const topOver: ShellRing = {
    y: last.y,
    rx: Math.max(0.018, last.rx - rimThickness * 0.45),
    rz: Math.max(0.018, last.rz - rimThickness * 0.45),
    centerX: last.centerX,
    zOffset: last.zOffset,
  };
  const topInner: ShellRing = {
    y: last.y - Math.min(lipHeight, 0.016),
    rx: Math.max(0.015, last.rx - rimThickness),
    rz: Math.max(0.015, last.rz - rimThickness),
    centerX: last.centerX,
    zOffset: last.zOffset,
  };

  const rings = [bottomInner, bottomUnder, ...outerRings, topOver, topInner];
  return {
    rings,
    startOuterIdx: 2,
    endOuterIdx: 2 + outerRings.length - 1,
  };
}

function createClosedSleeveGroup(options: {
  side: -1 | 1;
  shoulderX: number;
  shoulderY: number;
  abductionRad: number;
  armTopR: number;
  elbowR: number;
  wristR: number;
  upperArmLen: number;
  forearmLen: number;
  isLong: boolean;
  offsetFactor: number;
  offsetMin: number;
  material: THREE.Material;
  renderOrder: number;
}): THREE.Group {
  const {
    side,
    shoulderX,
    shoulderY,
    abductionRad,
    armTopR,
    elbowR,
    wristR,
    upperArmLen,
    forearmLen,
    isLong,
    offsetFactor,
    offsetMin,
    material,
    renderOrder,
  } = options;

  const holder = new THREE.Group();
  holder.position.set(shoulderX, shoulderY, 0);
  holder.rotation.z = side * abductionRad;
  holder.name = side < 0 ? 'sleeve_left_group' : 'sleeve_right_group';

  const pad = (r: number) => r * offsetFactor + offsetMin;

  // Remate esférico en hombro para unir manga y torso sin huecos
  const capRadius = pad(armTopR) * 1.03;
  const capGeo = new THREE.SphereGeometry(capRadius, 32, 24);
  capGeo.computeVertexNormals();
  const cap = new THREE.Mesh(capGeo, material);
  cap.castShadow = true;
  cap.receiveShadow = true;
  cap.renderOrder = renderOrder;
  cap.name = side < 0 ? 'sleeve_cap_left' : 'sleeve_cap_right';
  holder.add(cap);

  const upperSpan = isLong ? upperArmLen : upperArmLen * 0.56;
  const upperOuter: ShellRing[] = [];
  const upperSteps = 8;
  for (let s = 0; s <= upperSteps; s++) {
    const t = s / upperSteps;
    const y = -upperSpan * (1 - t); // de abajo hacia arriba (0)
    const distDown = 1 - t;
    const baseR = THREE.MathUtils.lerp(
      armTopR * 1.02,
      isLong ? elbowR * 1.08 : armTopR * 0.96,
      distDown,
    );
    const r = pad(baseR) + (isLong ? 0.002 : 0.005) * distDown;
    upperOuter.push({ y, rx: r, rz: r });
  }
  const upperClosed = buildClosedRimRings(upperOuter, 0.0055, 0.012);
  const upperGeo = createEllipticalShellGeometry(upperClosed.rings, { radialSegments: 32 });
  const upperMesh = new THREE.Mesh(upperGeo, material);
  upperMesh.castShadow = true;
  upperMesh.receiveShadow = true;
  upperMesh.renderOrder = renderOrder;
  upperMesh.name = side < 0 ? 'sleeve_upper_left' : 'sleeve_upper_right';
  holder.add(upperMesh);

  if (isLong) {
    // Esfera de codo desplazada + manga de antebrazo inclinada igual que el brazo
    const elbowRadius = pad(elbowR) * 1.08;
    const elbowGeo = new THREE.SphereGeometry(elbowRadius, 32, 20);
    elbowGeo.computeVertexNormals();
    const elbow = new THREE.Mesh(elbowGeo, material);
    elbow.position.set(0, -upperArmLen, 0);
    elbow.castShadow = true;
    elbow.renderOrder = renderOrder;
    holder.add(elbow);

    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -upperArmLen, 0);
    forearmGroup.rotation.x = -0.14;

    const foreLen = forearmLen * 0.93;
    const foreOuter: ShellRing[] = [];
    const foreSteps = 8;
    for (let s = 0; s <= foreSteps; s++) {
      const t = s / foreSteps;
      const y = -foreLen * (1 - t);
      const distDown = 1 - t;
      const baseR = THREE.MathUtils.lerp(elbowR * 1.06, wristR * 1.18, distDown);
      const r = pad(baseR) + 0.003;
      foreOuter.push({ y, rx: r, rz: r });
    }
    const foreClosed = buildClosedRimRings(foreOuter, 0.005, 0.012);
    const foreGeo = createEllipticalShellGeometry(foreClosed.rings, { radialSegments: 32 });
    const foreMesh = new THREE.Mesh(foreGeo, material);
    foreMesh.castShadow = true;
    foreMesh.receiveShadow = true;
    foreMesh.renderOrder = renderOrder;
    foreMesh.name = side < 0 ? 'sleeve_forearm_left' : 'sleeve_forearm_right';
    forearmGroup.add(foreMesh);

    holder.add(forearmGroup);
  }

  return holder;
}

/**
 * Crea la plantilla 3D procedural como cáscara desplazada 1.5–2.2 % (y ~3.8 % en abrigo)
 * respecto a las secciones anatómicas exactas del avatar, con bordes cerrados,
 * smooth shading (32–40 segmentos), polygonOffset y renderOrder por capa.
 */
export function createProceduralGarmentTemplate(
  templateId: GarmentTemplate3DId,
  avatarParams: Avatar3DParams,
  dominantColor: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `procedural-template-${templateId}`;

  const anatomy = computeAvatarAnatomy(avatarParams);
  const layer = getLayerForTemplate(templateId);
  const renderOrder = GARMENT_LAYER_RENDER_ORDER[layer];
  const polyOffset = GARMENT_POLYGON_OFFSET[layer];
  group.userData.garmentLayer = layer;
  group.userData.renderOrder = renderOrder;

  const baseMat = new THREE.MeshStandardMaterial({
    color: dominantColor,
    roughness: 0.8,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: polyOffset,
    polygonOffsetUnits: polyOffset,
  });

  if (templateId === 'tshirt' || templateId === 'longsleeve' || templateId === 'jacket') {
    const isOuter = templateId === 'jacket';
    const scaleFactor = isOuter ? 1.04 : 1.02;
    const minMargin = isOuter ? 0.012 : 0.0055;
    const rimThickness = isOuter ? 0.007 : 0.005;

    const yBot = anatomy.hipY + (isOuter ? 0.005 : 0.022);
    const yTop = anatomy.shoulderY - 0.008;
    const steps = 18;
    const outerRings: ShellRing[] = [];

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = THREE.MathUtils.lerp(yBot, yTop, t);
      const sec = sampleTorsoSection(anatomy, y);
      // En la parte baja de la chamarra damos un ligero vuelo cómodo sobre top/vestido
      const hemEase = isOuter ? (1 - t) * 0.006 : 0;
      outerRings.push({
        y,
        rx: sec.rx * scaleFactor + minMargin + hemEase,
        rz: sec.rz * scaleFactor + minMargin + hemEase,
        zOffset: sec.zOffset,
      });
    }

    const closed = buildClosedRimRings(outerRings, rimThickness, 0.014);
    const halfAngle = Math.PI * 0.3;
    const bodyGeo = createEllipticalShellGeometry(closed.rings, {
      radialSegments: 40,
      front: {
        startRingIndex: closed.startOuterIdx + 1,
        endRingIndex: closed.endOuterIdx - 1,
        halfAngleRad: halfAngle,
      },
    });

    const bodyMesh = new THREE.Mesh(bodyGeo, [baseMat.clone(), baseMat]);
    bodyMesh.userData.hasFrontGroup = true;
    bodyMesh.renderOrder = renderOrder;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.name = 'garment_shell';
    group.add(bodyMesh);

    const midSec = sampleTorsoSection(anatomy, (yBot + yTop) * 0.5);
    const frontArcWidth = 2 * (midSec.rx * scaleFactor + minMargin) * Math.sin(halfAngle);
    group.userData.frontPanelAspect = frontArcWidth / Math.max(0.18, yTop - yBot);

    // Solapa / cuello moldeado en chamarra
    if (isOuter) {
      const neckSec = sampleTorsoSection(anatomy, anatomy.shoulderY + 0.006);
      const collarGeo = new THREE.TorusGeometry(
        neckSec.rx * 0.72,
        0.013,
        14,
        36,
        Math.PI * 1.28,
      );
      collarGeo.computeVertexNormals();
      const collar = new THREE.Mesh(collarGeo, baseMat);
      collar.rotation.x = Math.PI / 2;
      collar.rotation.z = -Math.PI * 0.14;
      collar.position.set(0, anatomy.shoulderY + 0.004, -0.004);
      collar.renderOrder = renderOrder;
      collar.castShadow = true;
      collar.name = 'collar';
      group.add(collar);
    }

    const isLong = templateId === 'longsleeve' || isOuter;
    for (const side of [-1, 1] as const) {
      const sleeve = createClosedSleeveGroup({
        side,
        shoulderX: side * anatomy.shoulderJointX,
        shoulderY: anatomy.shoulderJointY,
        abductionRad: anatomy.armAbductionRad,
        armTopR: anatomy.armTopR,
        elbowR: anatomy.elbowR,
        wristR: anatomy.wristR,
        upperArmLen: anatomy.upperArmLen,
        forearmLen: anatomy.forearmLen,
        isLong,
        offsetFactor: scaleFactor,
        offsetMin: minMargin,
        material: baseMat,
        renderOrder,
      });
      group.add(sleeve);
    }
  } else if (templateId === 'pants' || templateId === 'shorts') {
    const isShort = templateId === 'shorts';
    const scaleFactor = 1.018;
    const minMargin = 0.005;

    // 1. Pretina y zona pélvica continua sobre torso/cadera
    const yWaistTop = anatomy.waistY + 0.012;
    const yPelvisBot = anatomy.crotchY - 0.012;
    const pelvisSteps = 10;
    const pelvisOuter: ShellRing[] = [];
    for (let s = 0; s <= pelvisSteps; s++) {
      const t = s / pelvisSteps;
      const y = THREE.MathUtils.lerp(yPelvisBot, yWaistTop, t);
      const sec = sampleTorsoSection(anatomy, y);
      pelvisOuter.push({
        y,
        rx: sec.rx * scaleFactor + minMargin,
        rz: sec.rz * scaleFactor + minMargin,
        zOffset: sec.zOffset,
      });
    }
    const pelvisClosed = buildClosedRimRings(pelvisOuter, 0.005, 0.012);
    const pelvisGeo = createEllipticalShellGeometry(pelvisClosed.rings, {
      radialSegments: 40,
      front: {
        startRingIndex: pelvisClosed.startOuterIdx,
        endRingIndex: pelvisClosed.endOuterIdx,
        halfAngleRad: Math.PI * 0.3,
        uMin: 0.14,
        uMax: 0.86,
        vMin: isShort ? 0.56 : 0.78,
        vMax: 0.98,
      },
    });
    const pelvisMesh = new THREE.Mesh(pelvisGeo, [baseMat.clone(), baseMat]);
    pelvisMesh.userData.hasFrontGroup = true;
    pelvisMesh.renderOrder = renderOrder;
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    pelvisMesh.name = 'waistband';
    group.add(pelvisMesh);

    // 2. Piernas de pantalón / short siguiendo exactamente el eje y perfil anatómico
    const legTopY = anatomy.hipJointY + 0.02;
    const legBotY = isShort
      ? anatomy.crotchY - (anatomy.crotchY - anatomy.kneeY) * 0.42
      : anatomy.ankleY + 0.018;
    const legSteps = isShort ? 10 : 20;

    for (const side of [-1, 1] as const) {
      const legOuter: ShellRing[] = [];
      for (let s = 0; s <= legSteps; s++) {
        const t = s / legSteps;
        const y = THREE.MathUtils.lerp(legBotY, legTopY, t);
        const legSec = sampleLegSection(anatomy, y);
        // Ligeramente holgado hacia el tobillo para silueta limpia de pantalón
        const hemRelax = isShort ? 0.006 : (1 - t) * 0.009;
        legOuter.push({
          y,
          centerX: side * legSec.centerX,
          rx: legSec.rx * scaleFactor + minMargin + hemRelax,
          rz: legSec.rz * scaleFactor + minMargin + hemRelax,
        });
      }
      const legClosed = buildClosedRimRings(legOuter, 0.005, 0.014);
      const legGeo = createEllipticalShellGeometry(legClosed.rings, {
        radialSegments: 36,
        front: {
          startRingIndex: legClosed.startOuterIdx + 1,
          endRingIndex: legClosed.endOuterIdx - 1,
          halfAngleRad: Math.PI * 0.3,
          uMin: side < 0 ? 0.08 : 0.54,
          uMax: side < 0 ? 0.46 : 0.92,
          vMin: 0.02,
          vMax: isShort ? 0.58 : 0.78,
        },
      });
      const legMesh = new THREE.Mesh(legGeo, [baseMat.clone(), baseMat]);
      legMesh.userData.hasFrontGroup = true;
      legMesh.renderOrder = renderOrder;
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      legMesh.name = side < 0 ? 'leg_left' : 'leg_right';
      group.add(legMesh);
    }

    const hipWidth = (anatomy.hipSpacingX + 0.075) * 2;
    group.userData.frontPanelAspect = hipWidth / Math.max(0.22, yWaistTop - legBotY);
  } else if (templateId === 'skirt') {
    const scaleFactor = 1.018;
    const minMargin = 0.005;
    const yTop = anatomy.waistY + 0.018;
    const yBot = anatomy.kneeY + 0.03;
    const steps = 18;
    const outerRings: ShellRing[] = [];

    const waistSec = sampleTorsoSection(anatomy, yTop);
    const hipSec = sampleTorsoSection(anatomy, anatomy.hipY);
    const hemMinRx = hipSec.rx * 1.32;
    const hemMinRz = hipSec.rz * 1.24;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps; // 0 = abajo (dobladillo), 1 = arriba (cintura)
      const y = THREE.MathUtils.lerp(yBot, yTop, t);
      const drop = 1 - t;

      // Vuelo suave en A desde cintura hasta dobladillo
      const baseRx = THREE.MathUtils.lerp(waistSec.rx * scaleFactor + minMargin, hemMinRx, Math.pow(drop, 0.85));
      const baseRz = THREE.MathUtils.lerp(waistSec.rz * scaleFactor + minMargin, hemMinRz, Math.pow(drop, 0.85));

      // Garantizar margen estricto fuera del torso Y fuera de ambas piernas
      const torsoSec = sampleTorsoSection(anatomy, Math.max(y, anatomy.crotchY - 0.01));
      const legSec = sampleLegSection(anatomy, Math.min(y, anatomy.hipJointY));
      const legOuterX = y <= anatomy.hipJointY + 0.04 ? legSec.centerX + legSec.rx + 0.026 : 0;
      const legOuterZ = y <= anatomy.hipJointY + 0.04 ? legSec.rz + 0.025 : 0;

      outerRings.push({
        y,
        rx: Math.max(baseRx, torsoSec.rx * scaleFactor + minMargin + 0.006, legOuterX),
        rz: Math.max(baseRz, torsoSec.rz * scaleFactor + minMargin + 0.006, legOuterZ),
        zOffset: y >= anatomy.crotchY ? torsoSec.zOffset * 0.6 : 0,
      });
    }

    const closed = buildClosedRimRings(outerRings, 0.0055, 0.018);
    const halfAngle = Math.PI * 0.32;
    const skirtGeo = createEllipticalShellGeometry(closed.rings, {
      radialSegments: 44,
      front: {
        startRingIndex: closed.startOuterIdx + 1,
        endRingIndex: closed.endOuterIdx - 1,
        halfAngleRad: halfAngle,
      },
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, [baseMat.clone(), baseMat]);
    skirtMesh.userData.hasFrontGroup = true;
    skirtMesh.renderOrder = renderOrder;
    skirtMesh.castShadow = true;
    skirtMesh.receiveShadow = true;
    skirtMesh.name = 'skirt_shell';
    group.add(skirtMesh);

    const midRing = outerRings[Math.floor(outerRings.length * 0.5)];
    const frontArcWidth = 2 * midRing.rx * Math.sin(halfAngle);
    group.userData.frontPanelAspect = frontArcWidth / Math.max(0.2, yTop - yBot);
  } else if (templateId === 'dress') {
    const scaleFactor = 1.02;
    const minMargin = 0.006;
    const yTop = anatomy.shoulderY - 0.016;
    const yBot = anatomy.kneeY - 0.025;
    const steps = 26;
    const outerRings: ShellRing[] = [];

    const waistSec = sampleTorsoSection(anatomy, anatomy.waistY);
    const hipSec = sampleTorsoSection(anatomy, anatomy.hipY);
    const hemMinRx = hipSec.rx * 1.38;
    const hemMinRz = hipSec.rz * 1.28;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = THREE.MathUtils.lerp(yBot, yTop, t);
      const torsoSec = sampleTorsoSection(anatomy, Math.max(y, anatomy.crotchY - 0.01));

      let rx = torsoSec.rx * scaleFactor + minMargin;
      let rz = torsoSec.rz * scaleFactor + minMargin;
      let zOff = torsoSec.zOffset;

      if (y < anatomy.waistY) {
        const drop = (anatomy.waistY - y) / Math.max(0.1, anatomy.waistY - yBot);
        const flareRx = THREE.MathUtils.lerp(
          waistSec.rx * scaleFactor + minMargin,
          hemMinRx,
          Math.pow(drop, 0.88),
        );
        const flareRz = THREE.MathUtils.lerp(
          waistSec.rz * scaleFactor + minMargin,
          hemMinRz,
          Math.pow(drop, 0.88),
        );
        const legSec = sampleLegSection(anatomy, Math.min(y, anatomy.hipJointY));
        const legOuterX = y <= anatomy.hipJointY + 0.04 ? legSec.centerX + legSec.rx + 0.028 : 0;
        const legOuterZ = y <= anatomy.hipJointY + 0.04 ? legSec.rz + 0.026 : 0;

        rx = Math.max(flareRx, rx + 0.006, legOuterX);
        rz = Math.max(flareRz, rz + 0.006, legOuterZ);
        zOff = y >= anatomy.crotchY ? torsoSec.zOffset * 0.5 : 0;
      }

      outerRings.push({ y, rx, rz, zOffset: zOff });
    }

    const closed = buildClosedRimRings(outerRings, 0.006, 0.018);
    const halfAngle = Math.PI * 0.31;
    const dressGeo = createEllipticalShellGeometry(closed.rings, {
      radialSegments: 44,
      front: {
        startRingIndex: closed.startOuterIdx + 1,
        endRingIndex: closed.endOuterIdx - 1,
        halfAngleRad: halfAngle,
      },
    });
    const dressMesh = new THREE.Mesh(dressGeo, [baseMat.clone(), baseMat]);
    dressMesh.userData.hasFrontGroup = true;
    dressMesh.renderOrder = renderOrder;
    dressMesh.castShadow = true;
    dressMesh.receiveShadow = true;
    dressMesh.name = 'dress_shell';
    group.add(dressMesh);

    const midRing = outerRings[Math.floor(outerRings.length * 0.5)];
    const frontArcWidth = 2 * midRing.rx * Math.sin(halfAngle);
    group.userData.frontPanelAspect = frontArcWidth / Math.max(0.3, yTop - yBot);
  } else if (templateId === 'shoes') {
    const soleMat = new THREE.MeshStandardMaterial({
      color: '#FBF7FA',
      roughness: 0.88,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: polyOffset,
      polygonOffsetUnits: polyOffset,
    });

    const limbScale = avatarParams.proportions.limbScaleX;
    const footR = 0.042 * limbScale;
    const footLen = 0.095;

    const soleGeo = new THREE.CapsuleGeometry(footR * 1.05, footLen * 1.05, 10, 32);
    soleGeo.scale(1.02, 0.36, 1.02);
    soleGeo.computeVertexNormals();

    const upperGeo = new THREE.CapsuleGeometry(footR * 1.06, footLen * 0.92, 12, 32);
    upperGeo.scale(1.0, 0.72, 1.0);
    upperGeo.computeVertexNormals();

    const cuffGeo = new THREE.TorusGeometry(0.039 * limbScale, 0.011, 14, 32);
    cuffGeo.computeVertexNormals();

    for (const side of [-1, 1] as const) {
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(side * anatomy.ankleSpacingX, 0, 0.028);
      shoeGroup.rotation.y = side * 0.055;

      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.rotation.x = Math.PI / 2;
      sole.position.set(0, footR * 0.36, 0);
      sole.renderOrder = renderOrder;
      sole.castShadow = true;
      sole.receiveShadow = true;
      sole.name = side < 0 ? 'sole_left' : 'sole_right';
      shoeGroup.add(sole);

      const upper = new THREE.Mesh(upperGeo, baseMat);
      upper.rotation.x = Math.PI / 2;
      upper.position.set(0, footR * 0.82, -0.002);
      upper.renderOrder = renderOrder;
      upper.castShadow = true;
      upper.receiveShadow = true;
      upper.name = side < 0 ? 'shoe_left' : 'shoe_right';
      shoeGroup.add(upper);

      const cuff = new THREE.Mesh(cuffGeo, baseMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, anatomy.ankleY + 0.004, -0.026);
      cuff.renderOrder = renderOrder;
      cuff.castShadow = true;
      cuff.name = side < 0 ? 'shoe_cuff_left' : 'shoe_cuff_right';
      shoeGroup.add(cuff);

      group.add(shoeGroup);
    }

    group.userData.frontPanelAspect = 1;
  }

  return group;
}
