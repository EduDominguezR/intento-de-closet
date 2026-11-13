import type { PoseLandmarker } from '@mediapipe/tasks-vision';

export type PoseDetectionStatus = 'ok' | 'partial' | 'not-found';

export interface PosePoint {
  x: number;
  y: number;
  visibility: number;
}

export interface BodyPoseLandmarks {
  status: PoseDetectionStatus;
  confidence: number;
  detectedAt: number;
  headCenter: { x: number; y: number };
  headWidth: number;
  neckCenter: { x: number; y: number };
  shoulderMid: { x: number; y: number };
  shoulderWidth: number;
  torsoAngleDeg: number;
  hipMid: { x: number; y: number };
  hipWidth: number;
  torsoHeight: number;
  ankleMid: { x: number; y: number };
  legHeight: number;
  handPoint: { x: number; y: number };
  bodyHeightRatio: number;
  keypoints: {
    nose?: PosePoint;
    leftEar?: PosePoint;
    rightEar?: PosePoint;
    leftShoulder?: PosePoint;
    rightShoulder?: PosePoint;
    leftElbow?: PosePoint;
    rightElbow?: PosePoint;
    leftHip?: PosePoint;
    rightHip?: PosePoint;
    leftKnee?: PosePoint;
    rightKnee?: PosePoint;
    leftAnkle?: PosePoint;
    rightAnkle?: PosePoint;
    leftWrist?: PosePoint;
    rightWrist?: PosePoint;
  };
}

export interface PoseDetectionOutput {
  pose: BodyPoseLandmarks;
  personMaskBlob?: Blob;
}

const MEDIAPIPE_WASM_ROOT = '/mediapipe/wasm';
const MEDIAPIPE_POSE_MODEL_PATH = '/mediapipe/models/pose_landmarker_lite.task';
const MIN_VISIBILITY = 0.35;

let landmarkerInstance: PoseLandmarker | null = null;
let landmarkerInitPromise: Promise<PoseLandmarker> | null = null;

function clamp01(v: number): number {
  return Math.min(0.98, Math.max(0.02, v));
}

function clampAngle(deg: number, maxAbs = 32): number {
  return Math.round(Math.min(maxAbs, Math.max(-maxAbs, deg)));
}

function isVisible(pt?: { visibility?: number }): boolean {
  if (!pt) return false;
  return (pt.visibility ?? 1) >= MIN_VISIBILITY;
}

function toPoint(pt?: { x: number; y: number; visibility?: number }): PosePoint | undefined {
  if (!pt || !isVisible(pt)) return undefined;
  return {
    x: clamp01(pt.x),
    y: clamp01(pt.y),
    visibility: Number((pt.visibility ?? 0.8).toFixed(2)),
  };
}

function midPoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerInitPromise) return landmarkerInitPromise;

  landmarkerInitPromise = (async () => {
    const { FilesetResolver, PoseLandmarker: MpPoseLandmarker } = await import(
      '@mediapipe/tasks-vision'
    );
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

    try {
      const gpuLandmarker = await MpPoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_POSE_MODEL_PATH,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputSegmentationMasks: true,
      });
      landmarkerInstance = gpuLandmarker;
      return gpuLandmarker;
    } catch {
      const cpuLandmarker = await MpPoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_POSE_MODEL_PATH,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputSegmentationMasks: true,
      });
      landmarkerInstance = cpuLandmarker;
      return cpuLandmarker;
    }
  })();

  try {
    return await landmarkerInitPromise;
  } catch (err) {
    landmarkerInitPromise = null;
    throw err;
  }
}

async function decodeBlobForPose(blob: Blob): Promise<{
  source: HTMLImageElement | ImageBitmap;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback a HTMLImageElement
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la foto para detectar pose.'));
      el.src = url;
    });
    return {
      source: img,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function extractPersonMaskBlob(
  mask: { width: number; height: number; hasFloat32Array: () => boolean; getAsFloat32Array: () => Float32Array; getAsUint8Array: () => Uint8Array },
): Promise<Blob | undefined> {
  const w = mask.width;
  const h = mask.height;
  if (w < 4 || h < 4) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const imgData = ctx.createImageData(w, h);
  const dst = imgData.data;

  if (mask.hasFloat32Array()) {
    const src = mask.getAsFloat32Array();
    for (let i = 0; i < w * h; i++) {
      const conf = Math.min(1, Math.max(0, src[i] ?? 0));
      const alpha = Math.round(conf * 255);
      const offset = i * 4;
      dst[offset] = 255;
      dst[offset + 1] = 255;
      dst[offset + 2] = 255;
      dst[offset + 3] = alpha;
    }
  } else {
    const src = mask.getAsUint8Array();
    for (let i = 0; i < w * h; i++) {
      const alpha = src[i] ?? 0;
      const offset = i * 4;
      dst[offset] = 255;
      dst[offset + 1] = 255;
      dst[offset + 2] = 255;
      dst[offset + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  return blob ?? undefined;
}

function buildNotFoundPose(): BodyPoseLandmarks {
  return {
    status: 'not-found',
    confidence: 0,
    detectedAt: Date.now(),
    headCenter: { x: 0.5, y: 0.14 },
    headWidth: 0.14,
    neckCenter: { x: 0.5, y: 0.24 },
    shoulderMid: { x: 0.5, y: 0.28 },
    shoulderWidth: 0.26,
    torsoAngleDeg: 0,
    hipMid: { x: 0.5, y: 0.52 },
    hipWidth: 0.2,
    torsoHeight: 0.24,
    ankleMid: { x: 0.5, y: 0.86 },
    legHeight: 0.34,
    handPoint: { x: 0.68, y: 0.54 },
    bodyHeightRatio: 0.76,
    keypoints: {},
  };
}

/**
 * Ejecuta MediaPipe PoseLandmarker localmente en el navegador sobre el Blob de la foto
 * y extrae anclas normalizadas + máscara de segmentación corporal para oclusión.
 */
export async function detectPoseAndMaskInPhotoBlob(blob: Blob): Promise<PoseDetectionOutput> {
  const landmarker = await getPoseLandmarker();
  const { source, cleanup } = await decodeBlobForPose(blob);

  try {
    const result = landmarker.detect(source);
    try {
      const raw = result.landmarks?.[0];
      if (!raw || raw.length < 29) {
        return { pose: buildNotFoundPose() };
      }

      const nose = toPoint(raw[0]);
      const leftEar = toPoint(raw[7]);
      const rightEar = toPoint(raw[8]);
      const leftShoulder = toPoint(raw[11]);
      const rightShoulder = toPoint(raw[12]);
      const leftElbow = toPoint(raw[13]);
      const rightElbow = toPoint(raw[14]);
      const leftWrist = toPoint(raw[15]);
      const rightWrist = toPoint(raw[16]);
      const leftHip = toPoint(raw[23]);
      const rightHip = toPoint(raw[24]);
      const leftKnee = toPoint(raw[25]);
      const rightKnee = toPoint(raw[26]);
      const leftAnkle = toPoint(raw[27]);
      const rightAnkle = toPoint(raw[28]);
      const leftFoot = toPoint(raw[31]);
      const rightFoot = toPoint(raw[32]);

      if (!leftShoulder || !rightShoulder) {
        return { pose: buildNotFoundPose() };
      }

      const shoulderMid = midPoint(leftShoulder, rightShoulder);
      const shoulderWidth = Math.max(0.08, distance2D(leftShoulder, rightShoulder));

      const visLeftShoulder = leftShoulder.x < rightShoulder.x ? leftShoulder : rightShoulder;
      const visRightShoulder = leftShoulder.x < rightShoulder.x ? rightShoulder : leftShoulder;
      const shoulderSlopeRad = Math.atan2(
        visRightShoulder.y - visLeftShoulder.y,
        Math.max(0.02, visRightShoulder.x - visLeftShoulder.x),
      );
      const torsoAngleDeg = clampAngle((shoulderSlopeRad * 180) / Math.PI, 28);

      const hasBothHips = Boolean(leftHip && rightHip);
      const hasOneHip = Boolean(leftHip || rightHip);
      const hipMid = hasBothHips && leftHip && rightHip
        ? midPoint(leftHip, rightHip)
        : hasOneHip
          ? {
              x: (leftHip ?? rightHip)!.x,
              y: (leftHip ?? rightHip)!.y,
            }
          : {
              x: shoulderMid.x,
              y: clamp01(shoulderMid.y + shoulderWidth * 1.15),
            };

      const hipWidth = hasBothHips && leftHip && rightHip
        ? Math.max(shoulderWidth * 0.55, distance2D(leftHip, rightHip))
        : shoulderWidth * 0.78;

      const torsoHeight = Math.max(0.1, Math.abs(hipMid.y - shoulderMid.y));

      const hasBothAnkles = Boolean(leftAnkle && rightAnkle);
      const hasOneAnkle = Boolean(leftAnkle || rightAnkle);
      const hasKnees = Boolean(leftKnee || rightKnee);

      let ankleMid: { x: number; y: number };
      if (hasBothAnkles && leftAnkle && rightAnkle) {
        ankleMid = midPoint(leftAnkle, rightAnkle);
      } else if (hasOneAnkle) {
        ankleMid = {
          x: (leftAnkle ?? rightAnkle)!.x,
          y: (leftAnkle ?? rightAnkle)!.y,
        };
      } else if (hasKnees) {
        const kneeY = leftKnee && rightKnee
          ? (leftKnee.y + rightKnee.y) / 2
          : (leftKnee ?? rightKnee)!.y;
        ankleMid = {
          x: hipMid.x,
          y: clamp01(kneeY + Math.max(0.14, torsoHeight * 0.85)),
        };
      } else {
        ankleMid = {
          x: hipMid.x,
          y: clamp01(hipMid.y + Math.max(0.24, torsoHeight * 1.48)),
        };
      }

      const legHeight = Math.max(0.12, Math.abs(ankleMid.y - hipMid.y));

      const headCenter = nose
        ? { x: nose.x, y: clamp01(nose.y - shoulderWidth * 0.06) }
        : { x: shoulderMid.x, y: clamp01(shoulderMid.y - torsoHeight * 0.55) };

      const headWidth = leftEar && rightEar
        ? Math.max(0.06, distance2D(leftEar, rightEar) * 1.1)
        : Math.max(0.08, shoulderWidth * 0.52);

      const neckCenter = {
        x: (headCenter.x + shoulderMid.x) / 2,
        y: shoulderMid.y - Math.min(0.05, torsoHeight * 0.14),
      };

      const chosenWrist =
        rightWrist && (!leftWrist || rightWrist.visibility >= leftWrist.visibility)
          ? rightWrist
          : leftWrist;
      const handPoint = chosenWrist
        ? {
            x: clamp01(chosenWrist.x + (chosenWrist.x >= hipMid.x ? 0.03 : -0.03)),
            y: clamp01(chosenWrist.y + 0.03),
          }
        : {
            x: clamp01(hipMid.x + hipWidth * 0.9),
            y: clamp01(hipMid.y + 0.04),
          };

      const footBottomY =
        leftFoot && rightFoot
          ? Math.max(leftFoot.y, rightFoot.y)
          : (leftFoot ?? rightFoot)?.y ?? ankleMid.y + 0.03;
      const headTopY = clamp01(headCenter.y - headWidth * 0.55);
      const bodyHeightRatio = Math.max(0.25, Math.min(0.95, footBottomY - headTopY));

      const visibilitySamples = [
        leftShoulder.visibility,
        rightShoulder.visibility,
        leftHip?.visibility,
        rightHip?.visibility,
        leftAnkle?.visibility,
        rightAnkle?.visibility,
      ].filter((v): v is number => typeof v === 'number');

      const confidence =
        visibilitySamples.length > 0
          ? Number(
              (
                visibilitySamples.reduce((acc, v) => acc + v, 0) /
                visibilitySamples.length
              ).toFixed(2),
            )
          : 0;

      const status: PoseDetectionStatus =
        hasBothHips && hasOneAnkle ? 'ok' : 'partial';

      const segMask = result.segmentationMasks?.[0];
      const personMaskBlob = segMask ? await extractPersonMaskBlob(segMask) : undefined;

      return {
        pose: {
          status,
          confidence,
          detectedAt: Date.now(),
          headCenter,
          headWidth,
          neckCenter,
          shoulderMid,
          shoulderWidth,
          torsoAngleDeg,
          hipMid,
          hipWidth,
          torsoHeight,
          ankleMid,
          legHeight,
          handPoint,
          bodyHeightRatio,
          keypoints: {
            nose,
            leftEar,
            rightEar,
            leftShoulder,
            rightShoulder,
            leftElbow,
            rightElbow,
            leftHip,
            rightHip,
            leftKnee,
            rightKnee,
            leftAnkle,
            rightAnkle,
            leftWrist,
            rightWrist,
          },
        },
        personMaskBlob,
      };
    } finally {
      result.close();
    }
  } finally {
    cleanup();
  }
}

export async function detectPoseInPhotoBlob(blob: Blob): Promise<BodyPoseLandmarks> {
  const { pose } = await detectPoseAndMaskInPhotoBlob(blob);
  return pose;
}
