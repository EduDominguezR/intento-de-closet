import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  computeAvatarAnatomy,
  sampleLegSection,
  sampleTorsoSection,
  type AvatarAnatomy,
} from '@/src/lib/avatar/mapping';
import { parametricAvatarProvider } from '@/src/lib/avatar/provider';
import type { AvatarConfig, AvatarHairStyle } from '@/src/lib/avatar/types';
import {
  applyMorphTargets,
  disposeObject3D,
  loadGLBModel,
  loadModelsManifest,
  type ModelsManifest,
} from '@/src/lib/three/models';
import {
  createEllipticalShellGeometry,
  type ShellRing,
} from '@/src/lib/three/templates';

export interface Avatar3DProps {
  config: AvatarConfig;
  manifest?: ModelsManifest | null;
}

/**
 * Detecta WebGL disponible y si el renderizador es software (SwiftShader/llvmpipe)
 * para adaptar pixelRatio, antialiasing y sombras sin alterar la escena.
 */
export function probeWebGLCapabilities(): { supported: boolean; isSoftwareGl: boolean } {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareGl: false };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { supported: false, isSoftwareGl: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return { supported: true, isSoftwareGl };
  } catch {
    return { supported: false, isSoftwareGl: false };
  }
}

/**
 * Genera una textura radial suave para sombra de contacto circular bajo los pies.
 */
export function createSoftContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(74, 68, 88, 0.34)');
    grad.addColorStop(0.32, 'rgba(74, 68, 88, 0.22)');
    grad.addColorStop(0.65, 'rgba(110, 97, 190, 0.08)');
    grad.addColorStop(1.0, 'rgba(110, 97, 190, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Calcula la posición y objetivo de cámara para encuadrar el cuerpo completo
 * (cabeza y pies con margen) en cualquier tamaño y relación de aspecto de panel.
 */
export function computeFittedCameraFrame(options: {
  totalHeight: number;
  maxWidth: number;
  fovDeg: number;
  aspect: number;
  bottomOverlayRatio?: number;
}): {
  targetY: number;
  distance: number;
  cameraY: number;
  minDistance: number;
  maxDistance: number;
} {
  const { totalHeight, maxWidth, fovDeg, aspect, bottomOverlayRatio = 0 } = options;
  const safeAspect = Math.max(0.35, aspect || 1);
  const halfFovRad = THREE.MathUtils.degToRad(fovDeg) * 0.5;
  const tanHalfV = Math.tan(halfFovRad);
  const tanHalfH = tanHalfV * safeAspect;

  // Reservar margen superior (~8%) + margen inferior (8% + espacio del dock si aplica)
  const topPad = 0.08;
  const bottomPad = 0.08 + bottomOverlayRatio;
  const usableVerticalFraction = Math.max(0.45, 1 - topPad - bottomPad);

  const distV = (totalHeight * 0.5) / (tanHalfV * usableVerticalFraction);
  const distH = (maxWidth * 0.5) / (tanHalfH * 0.72);
  const distance = Math.max(distV, distH) + 0.18;

  // Desplazar ligeramente el target hacia abajo para elevar el modelo sobre el dock inferior
  const centerBias = (bottomPad - topPad) * 0.5;
  const visibleHeightAtTarget = 2 * distance * tanHalfV;
  const targetY = totalHeight * 0.5 - centerBias * visibleHeightAtTarget;

  return {
    targetY,
    distance,
    cameraY: targetY + totalHeight * 0.06,
    minDistance: Math.max(1.2, distance * 0.55),
    maxDistance: Math.max(3.6, distance * 1.65),
  };
}

function createOvoidHeadGeometry(rx: number, ry: number, rz: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 44, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Afinar suavemente mandíbula/barbilla en la mitad inferior para perfil ovoide realista
    const jawTaper = y < 0 ? 1 - 0.16 * Math.pow(-y, 1.35) : 1;
    // Ligera proyección facial frontal suave
    const cheekSoft = y < 0.15 && y > -0.45 && z > 0 ? 1 + 0.03 * (1 - Math.abs(y + 0.15)) : 1;
    pos.setXYZ(i, x * rx * jawTaper, y * ry, z * rz * jawTaper * cheekSoft);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Construye el casquete craneal del cabello siguiendo una línea anatómica explícita
 * que deja despejados frente, ojos, boca y orejas, con volumen detrás y en coronilla.
 */
function createHairCapGeometry(
  headRx: number,
  headRy: number,
  headRz: number,
  volumeOffset = 0.011,
): THREE.BufferGeometry {
  const radialSegments = 48;
  const latSteps = 18;
  const cols = radialSegments + 1;
  const ringCount = latSteps + 2; // +1 anillo interior para cerrar el borde de línea de cabello

  const positions = new Float32Array(ringCount * cols * 3);
  const indices: number[] = [];

  function hairlineThetaForPhi(phi: number): number {
    // phi = 0 es frente (+Z), |phi| = PI/2 son sienes/orejas, |phi| = PI es nuca (-Z)
    const absPhi = Math.abs(phi);
    if (absPhi < Math.PI * 0.34) {
      // Línea de nacimiento alta en la frente con curva natural suave (sin tapar cejas ni frente)
      const u = absPhi / (Math.PI * 0.34);
      const centerArch = 0.04 * Math.exp(-u * u * 3);
      return Math.PI * (0.31 + 0.06 * u) - centerArch;
    }
    if (absPhi < Math.PI * 0.58) {
      // Rodea por encima y detrás de la oreja dejando el pabellón auricular visible
      const u = (absPhi - Math.PI * 0.34) / (Math.PI * 0.24);
      return Math.PI * THREE.MathUtils.lerp(0.37, 0.58, u * u * (3 - 2 * u));
    }
    // Baja suavemente por la nuca
    const u = (absPhi - Math.PI * 0.58) / (Math.PI * 0.42);
    return Math.PI * THREE.MathUtils.lerp(0.58, 0.76, u);
  }

  for (let i = 0; i <= radialSegments; i++) {
    const phi = -Math.PI + (i / radialSegments) * Math.PI * 2;
    const maxTheta = hairlineThetaForPhi(phi);

    for (let j = 0; j < ringCount; j++) {
      const isInnerEdge = j === ringCount - 1;
      const latT = isInnerEdge ? 1 : j / latSteps;
      const theta = latT * maxTheta;

      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const sx = Math.sin(phi);
      const cz = Math.cos(phi);

      const scaleBoost = isInnerEdge
        ? 0.985
        : 1 + (volumeOffset / Math.max(headRx, headRy)) * (0.55 + 0.45 * Math.sin(latT * Math.PI * 0.85));

      const x = headRx * scaleBoost * sinT * sx;
      const y = headRy * scaleBoost * cosT + (isInnerEdge ? 0 : 0.004);
      const z = headRz * scaleBoost * sinT * cz - (cosT < 0.7 ? 0.004 : 0);

      const idx = (j * cols + i) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * cols + i;
      const b = j * cols + i + 1;
      const c = (j + 1) * cols + i + 1;
      const d = (j + 1) * cols + i;
      indices.push(a, d, c);
      indices.push(a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Cortina trasera-lateral cerrada para melenas media, ondulada y larga:
 * cubre únicamente detrás de las orejas (sin invadir el rostro ni el torso).
 */
function createHairDrapeGeometry(options: {
  headRx: number;
  headRy: number;
  headRz: number;
  dropLength: number;
  flareWidth: number;
  wavy: boolean;
}): THREE.BufferGeometry {
  const { headRx, headRy, headRz, dropLength, flareWidth, wavy } = options;
  const arcHalf = Math.PI * 0.56; // Cubre desde detrás de oreja izquierda, toda la nuca, hasta detrás de oreja derecha
  const radialSegs = 36;
  const ySegs = 16;

  // Usamos una malla cerrada en herradura con espesor para evitar triángulos sueltos y caras simples
  const cols = radialSegs + 1;
  const rows = ySegs + 1;
  const ringCount = rows * 2; // cara exterior (0..rows-1) + cara interior de retorno (rows..2*rows-1)
  const positions = new Float32Array(ringCount * cols * 3);
  const indices: number[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const isInner = pass === 1;
    for (let r = 0; r < rows; r++) {
      const j = isInner ? rows + (rows - 1 - r) : r;
      const v = r / ySegs; // 0 = arriba (coronilla trasera), 1 = puntas
      const y = THREE.MathUtils.lerp(headRy * 0.42, headRy * 0.42 - dropLength, v);

      // Empuje suave hacia atrás (-Z) al descender para librar cuello y hombros sin penetrar prendas
      const backSweepZ = -headRz * 0.14 - Math.pow(v, 1.35) * 0.055;
      const wave = wavy ? Math.sin(v * Math.PI * 3.5) * 0.008 * Math.sin(v * Math.PI) : 0;
      const flare = 1 + Math.sin(v * Math.PI * 0.85) * flareWidth + wave;
      const thick = isInner ? -0.014 : 0;

      for (let i = 0; i <= radialSegs; i++) {
        // phi centrado en PI (-Z espalda)
        const phi = Math.PI - arcHalf + (i / radialSegs) * (arcHalf * 2);
        // Afinar hacia los bordes laterales para que el perfil frontal sea limpio tras las orejas
        const edgeFade = Math.sin((i / radialSegs) * Math.PI);
        const rx = (headRx * 1.12 * flare + thick) * (0.92 + 0.08 * edgeFade);
        const rz = headRz * 1.08 * (1 + v * 0.2) + (isInner ? -0.012 : 0);

        const x = rx * Math.sin(phi);
        const z = backSweepZ + rz * Math.cos(phi);

        const idx = (j * cols + i) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
      }
    }
  }

  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = j * cols + i;
      const b = j * cols + i + 1;
      const c = (j + 1) * cols + i + 1;
      const d = (j + 1) * cols + i;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // Cerrar ambos bordes laterales (i = 0 e i = radialSegs)
  for (let r = 0; r < rows - 1; r++) {
    const out0 = r * cols;
    const out1 = (r + 1) * cols;
    const in0 = (ringCount - 1 - r) * cols;
    const in1 = (ringCount - 1 - (r + 1)) * cols;
    indices.push(out0, in0, in1);
    indices.push(out0, in1, out1);

    const outR0 = r * cols + radialSegs;
    const outR1 = (r + 1) * cols + radialSegs;
    const inR0 = (ringCount - 1 - r) * cols + radialSegs;
    const inR1 = (ringCount - 1 - (r + 1)) * cols + radialSegs;
    indices.push(outR0, outR1, inR1);
    indices.push(outR0, inR1, inR0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createProceduralHairGroup(
  style: AvatarHairStyle,
  color: string,
  anatomy: AvatarAnatomy,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'procedural-hair';

  const { headRx, headRy, headRz, headCenterY, shoulderY, chestY } = anatomy;
  const hairMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    metalness: 0.03,
  });

  // Casquete base en la línea del cabello (frente y orejas siempre libres)
  const capGeo = createHairCapGeometry(headRx, headRy, headRz, style === 'bun' ? 0.008 : 0.012);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  if (style === 'crop') {
    // Volumen superior y trasero suave para cabello corto
    const crownGeo = new THREE.SphereGeometry(headRx * 0.96, 32, 24);
    crownGeo.scale(1.02, 0.56, 1.06);
    crownGeo.computeVertexNormals();
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.position.set(0, headRy * 0.68, -headRz * 0.16);
    crown.rotation.x = -0.22;
    crown.castShadow = true;
    group.add(crown);
  } else if (style === 'bun') {
    // Recogido alto en coronilla trasera
    const bunGeo = new THREE.SphereGeometry(headRx * 0.62, 32, 24);
    bunGeo.scale(1.05, 0.92, 0.95);
    bunGeo.computeVertexNormals();
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.position.set(0, headRy * 0.66, -headRz * 0.88);
    bun.castShadow = true;
    group.add(bun);

    const tieGeo = new THREE.TorusGeometry(headRx * 0.36, 0.007, 12, 32);
    const tieMat = new THREE.MeshStandardMaterial({ color: '#8B7FD4', roughness: 0.72 });
    const tie = new THREE.Mesh(tieGeo, tieMat);
    tie.position.set(0, headRy * 0.6, -headRz * 0.74);
    tie.rotation.x = Math.PI * 0.32;
    group.add(tie);
  } else if (style === 'bob') {
    const drop = Math.max(0.16, headCenterY + headRy * 0.42 - (anatomy.chinY - 0.025));
    const bobGeo = createHairDrapeGeometry({
      headRx,
      headRy,
      headRz,
      dropLength: drop,
      flareWidth: 0.14,
      wavy: false,
    });
    const bob = new THREE.Mesh(bobGeo, hairMat);
    bob.castShadow = true;
    bob.receiveShadow = true;
    group.add(bob);
  } else if (style === 'wavy') {
    const drop = Math.max(0.24, headCenterY + headRy * 0.42 - (shoulderY + 0.015));
    const wavyGeo = createHairDrapeGeometry({
      headRx,
      headRy,
      headRz,
      dropLength: drop,
      flareWidth: 0.22,
      wavy: true,
    });
    const wavyMesh = new THREE.Mesh(wavyGeo, hairMat);
    wavyMesh.castShadow = true;
    wavyMesh.receiveShadow = true;
    group.add(wavyMesh);
  } else if (style === 'long') {
    const drop = Math.max(0.36, headCenterY + headRy * 0.42 - (chestY - 0.03));
    const longGeo = createHairDrapeGeometry({
      headRx,
      headRy,
      headRz,
      dropLength: drop,
      flareWidth: 0.24,
      wavy: false,
    });
    const longMesh = new THREE.Mesh(longGeo, hairMat);
    longMesh.castShadow = true;
    longMesh.receiveShadow = true;
    group.add(longMesh);
  }

  return group;
}

/**
 * Construye el avatar procedural paramétrico continuo (cero huecos en hombros,
 * codos, caderas y rodillas) en metros con origen exacto en y = 0 (suela de pies).
 */
function buildProceduralAvatarGroup(config: AvatarConfig): THREE.Group {
  const { params3D } = parametricAvatarProvider.resolveParametric(config);
  const anatomy = computeAvatarAnatomy(params3D);
  const { skinColor, hairStyle, hairColor } = params3D;
  const { limbScaleX } = params3D.proportions;

  const root = new THREE.Group();
  root.name = 'procedural-avatar-root';

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.78,
    metalness: 0.02,
  });

  const baseWearMat = new THREE.MeshStandardMaterial({
    color: '#F2ECF9',
    roughness: 0.84,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -0.5,
    polygonOffsetUnits: -0.5,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#3D354C',
    roughness: 0.45,
    metalness: 0.04,
  });

  const mouthMat = new THREE.MeshStandardMaterial({
    color: '#C98A92',
    roughness: 0.65,
    metalness: 0.02,
  });

  // 1. Torso + pelvis + cuello en una sola malla continua con suavizado de 40 segmentos
  const torsoRings: ShellRing[] = [];
  const yStart = anatomy.crotchY - 0.015;
  const yEnd = anatomy.neckTopY;
  const torsoSamples = 32;

  const startSec = sampleTorsoSection(anatomy, yStart);
  torsoRings.push({ y: yStart, rx: 0.002, rz: 0.002, zOffset: startSec.zOffset });
  for (let s = 0; s <= torsoSamples; s++) {
    const y = THREE.MathUtils.lerp(yStart, yEnd, s / torsoSamples);
    const sec = sampleTorsoSection(anatomy, y);
    torsoRings.push({ y, rx: sec.rx, rz: sec.rz, zOffset: sec.zOffset });
  }
  const endSec = sampleTorsoSection(anatomy, yEnd);
  torsoRings.push({ y: yEnd, rx: 0.002, rz: 0.002, zOffset: endSec.zOffset });

  const torsoGeo = createEllipticalShellGeometry(torsoRings, { radialSegments: 40 });
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.name = 'torso_continuous';
  root.add(torso);

  // Ropa base neutra sutil (desplazada ligeramente sobre el cuerpo sin z-fighting)
  const briefRings: ShellRing[] = [];
  for (let s = 0; s <= 10; s++) {
    const y = THREE.MathUtils.lerp(anatomy.crotchY + 0.004, anatomy.hipY + 0.045, s / 10);
    const sec = sampleTorsoSection(anatomy, y);
    briefRings.push({ y, rx: sec.rx * 1.008 + 0.0015, rz: sec.rz * 1.008 + 0.0015, zOffset: sec.zOffset });
  }
  const briefMesh = new THREE.Mesh(
    createEllipticalShellGeometry(briefRings, { radialSegments: 36 }),
    baseWearMat,
  );
  briefMesh.castShadow = true;
  briefMesh.receiveShadow = true;
  root.add(briefMesh);

  const bandeauxRings: ShellRing[] = [];
  for (let s = 0; s <= 8; s++) {
    const y = THREE.MathUtils.lerp(anatomy.chestY - 0.06, anatomy.chestY + 0.055, s / 8);
    const sec = sampleTorsoSection(anatomy, y);
    bandeauxRings.push({ y, rx: sec.rx * 1.008 + 0.0015, rz: sec.rz * 1.008 + 0.0015, zOffset: sec.zOffset });
  }
  const bandeauxMesh = new THREE.Mesh(
    createEllipticalShellGeometry(bandeauxRings, { radialSegments: 36 }),
    baseWearMat,
  );
  bandeauxMesh.castShadow = true;
  bandeauxMesh.receiveShadow = true;
  root.add(bandeauxMesh);

  // 2. Piernas esculpidas con esferas de cadera, rodilla, tobillo y pies apoyados en y = 0
  const hipSecAtJoint = sampleLegSection(anatomy, anatomy.hipJointY);
  const kneeSec = sampleLegSection(anatomy, anatomy.kneeY);
  const ankleSec = sampleLegSection(anatomy, anatomy.ankleY);

  const hipSphereGeo = new THREE.SphereGeometry(hipSecAtJoint.rx * 1.02, 32, 24);
  hipSphereGeo.computeVertexNormals();
  const kneeSphereGeo = new THREE.SphereGeometry(kneeSec.rx * 1.01, 32, 24);
  kneeSphereGeo.computeVertexNormals();
  const ankleSphereGeo = new THREE.SphereGeometry(ankleSec.rx * 1.0, 32, 20);
  ankleSphereGeo.computeVertexNormals();

  const footRadius = 0.033 * limbScaleX;
  const footGeo = new THREE.CapsuleGeometry(footRadius, 0.084, 12, 32);
  footGeo.scale(1.02, 0.72, 1.0);
  footGeo.computeVertexNormals();

  for (const side of [-1, 1] as const) {
    // Esfera de articulación de cadera integrada en pelvis
    const hipSphere = new THREE.Mesh(hipSphereGeo, skinMat);
    hipSphere.position.set(side * hipSecAtJoint.centerX, anatomy.hipJointY, 0);
    hipSphere.castShadow = true;
    hipSphere.receiveShadow = true;
    root.add(hipSphere);

    // Pierna continua (muslo -> rodilla -> pantorrilla -> tobillo)
    const legRings: ShellRing[] = [];
    const legSamples = 26;
    for (let s = 0; s <= legSamples; s++) {
      const y = THREE.MathUtils.lerp(anatomy.ankleY, anatomy.hipJointY, s / legSamples);
      const sec = sampleLegSection(anatomy, y);
      legRings.push({ y, centerX: side * sec.centerX, rx: sec.rx, rz: sec.rz });
    }
    const legGeo = createEllipticalShellGeometry(legRings, { radialSegments: 36 });
    const legMesh = new THREE.Mesh(legGeo, skinMat);
    legMesh.castShadow = true;
    legMesh.receiveShadow = true;
    root.add(legMesh);

    const kneeSphere = new THREE.Mesh(kneeSphereGeo, skinMat);
    kneeSphere.position.set(side * kneeSec.centerX, anatomy.kneeY, 0.002);
    kneeSphere.castShadow = true;
    kneeSphere.receiveShadow = true;
    root.add(kneeSphere);

    const ankleSphere = new THREE.Mesh(ankleSphereGeo, skinMat);
    ankleSphere.position.set(side * ankleSec.centerX, anatomy.ankleY, 0);
    ankleSphere.castShadow = true;
    ankleSphere.receiveShadow = true;
    root.add(ankleSphere);

    const foot = new THREE.Mesh(footGeo, skinMat);
    foot.rotation.x = Math.PI / 2;
    foot.rotation.z = -side * 0.055;
    foot.position.set(side * ankleSec.centerX, footRadius * 0.72, 0.032);
    foot.castShadow = true;
    foot.receiveShadow = true;
    root.add(foot);
  }

  // 3. Hombros y brazos continuos con esferas de articulación del mismo material (sin huecos)
  const shoulderSphereGeo = new THREE.SphereGeometry(anatomy.armTopR * 1.1, 32, 24);
  shoulderSphereGeo.computeVertexNormals();
  const elbowSphereGeo = new THREE.SphereGeometry(anatomy.elbowR * 1.03, 32, 24);
  elbowSphereGeo.computeVertexNormals();
  const wristSphereGeo = new THREE.SphereGeometry(anatomy.wristR * 1.0, 28, 20);
  wristSphereGeo.computeVertexNormals();
  const handGeo = new THREE.CapsuleGeometry(anatomy.wristR * 0.92, 0.048, 10, 32);
  handGeo.scale(0.84, 1.0, 0.56);
  handGeo.computeVertexNormals();

  const upperArmRings: ShellRing[] = [];
  for (let s = 0; s <= 12; s++) {
    const t = s / 12; // 0 = codo, 1 = hombro
    const y = -anatomy.upperArmLen * (1 - t);
    const r = THREE.MathUtils.lerp(anatomy.elbowR, anatomy.armTopR, Math.pow(t, 0.85));
    upperArmRings.push({ y, rx: r, rz: r * 0.96 });
  }
  const upperArmGeo = createEllipticalShellGeometry(upperArmRings, { radialSegments: 32 });

  const forearmRings: ShellRing[] = [];
  for (let s = 0; s <= 12; s++) {
    const t = s / 12; // 0 = muñeca, 1 = codo
    const y = -anatomy.forearmLen * (1 - t);
    const swell = Math.sin(t * Math.PI) * 0.004 * limbScaleX;
    const r = THREE.MathUtils.lerp(anatomy.wristR, anatomy.elbowR, t) + swell;
    forearmRings.push({ y, rx: r, rz: r * 0.94 });
  }
  const forearmGeo = createEllipticalShellGeometry(forearmRings, { radialSegments: 32 });

  for (const side of [-1, 1] as const) {
    const shoulderJoint = new THREE.Group();
    shoulderJoint.position.set(side * anatomy.shoulderJointX, anatomy.shoulderJointY, 0);
    shoulderJoint.rotation.z = side * anatomy.armAbductionRad;

    const shoulderSphere = new THREE.Mesh(shoulderSphereGeo, skinMat);
    shoulderSphere.castShadow = true;
    shoulderSphere.receiveShadow = true;
    shoulderJoint.add(shoulderSphere);

    const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
    upperArm.castShadow = true;
    upperArm.receiveShadow = true;
    shoulderJoint.add(upperArm);

    const elbowSphere = new THREE.Mesh(elbowSphereGeo, skinMat);
    elbowSphere.position.set(0, -anatomy.upperArmLen, 0);
    elbowSphere.castShadow = true;
    elbowSphere.receiveShadow = true;
    shoulderJoint.add(elbowSphere);

    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -anatomy.upperArmLen, 0);
    forearmGroup.rotation.x = -0.14;

    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.castShadow = true;
    forearm.receiveShadow = true;
    forearmGroup.add(forearm);

    const wrist = new THREE.Mesh(wristSphereGeo, skinMat);
    wrist.position.set(0, -anatomy.forearmLen, 0);
    wrist.castShadow = true;
    forearmGroup.add(wrist);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(0, -anatomy.forearmLen - 0.036, 0.004);
    hand.castShadow = true;
    forearmGroup.add(hand);

    shoulderJoint.add(forearmGroup);
    root.add(shoulderJoint);
  }

  // 4. Cabeza ovoide (1/7.5 de estatura), orejas, rostro despejado y cabello
  const headGroup = new THREE.Group();
  headGroup.position.set(0, anatomy.headCenterY, 0.006);

  const { headRx, headRy, headRz } = anatomy;
  const headGeo = createOvoidHeadGeometry(headRx, headRy, headRz);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.castShadow = true;
  head.receiveShadow = true;
  headGroup.add(head);

  // Orejas visibles a ambos lados
  const earGeo = new THREE.SphereGeometry(headRy * 0.16, 20, 16);
  earGeo.scale(0.42, 1.0, 0.68);
  earGeo.computeVertexNormals();
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * headRx * 0.96, -headRy * 0.07, -headRz * 0.06);
    ear.rotation.z = -side * 0.12;
    ear.castShadow = true;
    headGroup.add(ear);
  }

  // Ojos, cejas sutiles, nariz discreta y sonrisa suave en +Z
  const eyeGeo = new THREE.SphereGeometry(headRx * 0.095, 16, 14);
  eyeGeo.scale(1.0, 1.15, 0.55);
  const browMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.78,
    metalness: 0.02,
  });
  const browGeo = new THREE.CapsuleGeometry(headRy * 0.016, headRx * 0.18, 6, 16);

  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * headRx * 0.31, headRy * 0.05, headRz * 0.9);
    headGroup.add(eye);

    const brow = new THREE.Mesh(browGeo, browMat);
    brow.position.set(side * headRx * 0.31, headRy * 0.21, headRz * 0.88);
    brow.rotation.z = Math.PI / 2 - side * 0.12;
    headGroup.add(brow);
  }

  const noseGeo = new THREE.CapsuleGeometry(headRx * 0.055, headRy * 0.13, 8, 16);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, -headRy * 0.06, headRz * 0.95);
  nose.rotation.x = -0.18;
  headGroup.add(nose);

  const mouthGeo = new THREE.TorusGeometry(headRx * 0.16, headRy * 0.018, 10, 24, Math.PI * 0.52);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, -headRy * 0.32, headRz * 0.86);
  mouth.rotation.z = Math.PI * 1.24;
  headGroup.add(mouth);

  const hairGroup = createProceduralHairGroup(hairStyle, hairColor, anatomy);
  headGroup.add(hairGroup);
  root.add(headGroup);

  return root;
}

export function Avatar3D({ config, manifest }: Avatar3DProps) {
  const { params3D } = useMemo(
    () => parametricAvatarProvider.resolveParametric(config),
    [config],
  );
  const [glbScene, setGlbScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let active = true;
    const avatarGlb = manifest?.avatar?.glb ?? null;
    if (!avatarGlb) {
      setGlbScene(null);
      return;
    }

    void loadGLBModel(avatarGlb).then((gltf) => {
      if (!active) {
        if (gltf?.scene) disposeObject3D(gltf.scene);
        return;
      }
      if (!gltf?.scene) {
        setGlbScene(null);
        return;
      }
      const cloned = gltf.scene.clone(true);
      cloned.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      setGlbScene(cloned);
    });

    return () => {
      active = false;
    };
  }, [manifest?.avatar?.glb]);

  // Aplicar morph targets y materiales cuando hay GLB real
  useEffect(() => {
    if (!glbScene) return;
    const morphNames = manifest?.avatar?.morphTargets ?? {
      slim: 'body_slim',
      curvy: 'body_curvy',
      short: 'height_short',
      tall: 'height_tall',
    };
    applyMorphTargets(glbScene, morphNames, params3D.morphWeights);

    glbScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const name = mesh.name.toLowerCase();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        if (name.includes('skin') || name.includes('body')) {
          mat.color.set(params3D.skinColor);
        } else if (name.includes('hair')) {
          mat.color.set(params3D.hairColor);
        }
      }
    });
  }, [glbScene, manifest?.avatar?.morphTargets, params3D]);

  useEffect(() => {
    return () => {
      if (glbScene) disposeObject3D(glbScene);
    };
  }, [glbScene]);

  const proceduralGroup = useMemo(() => {
    if (glbScene) return null;
    return buildProceduralAvatarGroup(config);
  }, [config, glbScene]);

  useEffect(() => {
    return () => {
      if (proceduralGroup) disposeObject3D(proceduralGroup);
    };
  }, [proceduralGroup]);

  if (glbScene) {
    return <primitive object={glbScene} />;
  }

  return proceduralGroup ? <primitive object={proceduralGroup} /> : null;
}

function StudioEnvironment({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();

    return () => {
      scene.environment = null;
      envTex.dispose();
    };
  }, [gl, scene]);

  return (
    <>
      <color attach="background" args={['#FFFBFD']} />
      <hemisphereLight args={['#F7F3FF', '#F3E5EC', 1.08]} />
      <directionalLight
        position={[1.8, 3.4, 2.5]}
        intensity={1.25}
        color="#FFF8F0"
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-1.1}
        shadow-camera-right={1.1}
        shadow-camera-top={2.1}
        shadow-camera-bottom={-0.3}
        shadow-camera-near={0.5}
        shadow-camera-far={9}
        shadow-radius={4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-2.1, 2.2, -2.0]} intensity={0.52} color="#DDD4FA" />
    </>
  );
}

function AvatarStageContent({
  config,
  manifest,
  autoRotate,
  isSoftwareGl,
}: {
  config: AvatarConfig;
  manifest: ModelsManifest | null;
  autoRotate: boolean;
  isSoftwareGl: boolean;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size } = useThree();

  const { params3D } = useMemo(
    () => parametricAvatarProvider.resolveParametric(config),
    [config],
  );
  const contactTexture = useMemo(() => createSoftContactShadowTexture(), []);

  useEffect(() => {
    return () => {
      contactTexture.dispose();
    };
  }, [contactTexture]);

  const frame = useMemo(
    () =>
      computeFittedCameraFrame({
        totalHeight: params3D.proportions.totalHeightMeters,
        maxWidth: 0.62 * params3D.proportions.hipScaleX,
        fovDeg: 36,
        aspect: size.width / Math.max(1, size.height),
        bottomOverlayRatio: 0,
      }),
    [
      params3D.proportions.hipScaleX,
      params3D.proportions.totalHeightMeters,
      size.height,
      size.width,
    ],
  );

  // Ajustar encuadre automático en onboarding al cambiar tamaño de panel o estatura
  useEffect(() => {
    camera.position.set(0, frame.cameraY, frame.distance);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, frame.targetY, 0);
      controls.update();
    }
  }, [camera, frame.cameraY, frame.distance, frame.targetY]);

  useFrame((_, delta) => {
    if (autoRotate && spinRef.current) {
      spinRef.current.rotation.y += delta * 0.25;
    }
  });

  return (
    <>
      <StudioEnvironment isSoftwareGl={isSoftwareGl} />
      <group ref={spinRef} position={[0, 0, 0]}>
        <Avatar3D config={config} manifest={manifest} />
      </group>

      {/* Sombra de contacto circular suave bajo los pies */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.42, 40]} />
        <meshBasicMaterial map={contactTexture} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <circleGeometry args={[0.9, 32]} />
        <shadowMaterial transparent opacity={0.14} color="#4A4458" />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping={!isSoftwareGl}
        minDistance={frame.minDistance}
        maxDistance={frame.maxDistance}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.54}
        target={[0, frame.targetY, 0]}
      />
    </>
  );
}

export interface Avatar3DPreviewProps {
  config: AvatarConfig;
  className?: string;
}

export function Avatar3DPreview({ config, className = 'w-full h-full' }: Avatar3DPreviewProps) {
  const { supported, isSoftwareGl } = useMemo(() => probeWebGLCapabilities(), []);
  const [manifest, setManifest] = useState<ModelsManifest | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    void loadModelsManifest().then(setManifest);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!supported) {
    return (
      <div
        className={`${className} rounded-2xl bg-[#E6E0F8]/35 border border-[#E6E0F8] flex flex-col items-center justify-center p-4 text-center`}
      >
        <p className="text-xs font-semibold text-[#4A4458]">Vista 3D no disponible</p>
        <p className="text-[11px] text-[#6B6580] mt-1">
          Tu navegador no tiene WebGL activo. Tu avatar 2D funcionará normalmente.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`${className} relative rounded-2xl overflow-hidden bg-[#FFFBFD]`}
      aria-label="Vista previa 3D aproximada del avatar paramétrico"
    >
      <Canvas
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        camera={{ position: [0, 0.9, 3.15], fov: 36 }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        }}
      >
        <AvatarStageContent
          config={config}
          manifest={manifest}
          autoRotate={!reducedMotion && !isSoftwareGl}
          isSoftwareGl={isSoftwareGl}
        />
      </Canvas>
    </div>
  );
}

export default Avatar3DPreview;
