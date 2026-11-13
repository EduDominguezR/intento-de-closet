import type { BodyPoseLandmarks } from '@/src/lib/photo/pose';
import type { LocalUserPhoto } from '@/src/lib/photo/storage';

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen para oclusión.'));
    };
    img.src = url;
  });
}

function drawFeatheredCapsule(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(8, radius * 2);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
}

/**
 * Construye un lienzo transparente con solo los píxeles reales del usuario que deben quedar
 * por delante de las prendas del torso (antebrazos, manos y cabeza/cabello),
 * intersectando la máscara de segmentación corporal de MediaPipe con las regiones clave de pose.
 */
export async function buildForegroundOcclusionCanvas(
  photo: LocalUserPhoto,
  pose: BodyPoseLandmarks | null | undefined,
): Promise<HTMLCanvasElement | null> {
  if (!photo.personMaskBlob || !pose || pose.status === 'not-found') {
    return null;
  }

  const [photoImg, maskImg] = await Promise.all([
    loadImageFromBlob(photo.blob),
    loadImageFromBlob(photo.personMaskBlob),
  ]);

  const maxSide = 1200;
  const srcMax = Math.max(photo.width, photo.height, 1);
  const scale = srcMax > maxSide ? maxSide / srcMax : 1;
  const w = Math.max(1, Math.round(photo.width * scale));
  const h = Math.max(1, Math.round(photo.height * scale));

  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = w;
  regionCanvas.height = h;
  const rCtx = regionCanvas.getContext('2d');
  if (!rCtx) return null;

  const kp = pose.keypoints;
  const forearmRadius = Math.max(10, pose.shoulderWidth * w * 0.14);

  rCtx.save();
  rCtx.filter = 'blur(4px)';

  // 1. Cabeza / rostro / cabello por encima de los hombros (evita que cuellos tapen la cara o el pelo)
  const headRadiusX = Math.max(16, pose.headWidth * w * 0.72);
  const headRadiusY = Math.max(20, pose.torsoHeight * h * 0.34);
  const headCenterPx = {
    x: pose.headCenter.x * w,
    y: Math.min(pose.neckCenter.y * h - headRadiusY * 0.15, pose.headCenter.y * h),
  };
  rCtx.fillStyle = '#FFFFFF';
  rCtx.beginPath();
  rCtx.ellipse(headCenterPx.x, headCenterPx.y, headRadiusX, headRadiusY, 0, 0, Math.PI * 2);
  rCtx.fill();

  // 2. Antebrazos y manos (codo -> muñeca -> extensión de mano)
  const drawForearm = (
    elbow?: { x: number; y: number },
    wrist?: { x: number; y: number },
  ) => {
    if (!wrist) return;
    if (elbow) {
      const startX = (elbow.x * 0.8 + wrist.x * 0.2) * w;
      const startY = (elbow.y * 0.8 + wrist.y * 0.2) * h;
      const extX = wrist.x * w + (wrist.x - elbow.x) * w * 0.28;
      const extY = wrist.y * h + (wrist.y - elbow.y) * h * 0.28;
      drawFeatheredCapsule(rCtx, startX, startY, extX, extY, forearmRadius);
    } else {
      drawFeatheredCapsule(
        rCtx,
        wrist.x * w,
        wrist.y * h,
        wrist.x * w,
        wrist.y * h + forearmRadius * 0.6,
        forearmRadius * 1.15,
      );
    }
  };

  drawForearm(kp.leftElbow, kp.leftWrist);
  drawForearm(kp.rightElbow, kp.rightWrist);
  rCtx.restore();

  // 3. Intersectar con la máscara real de segmentación corporal de MediaPipe
  rCtx.save();
  rCtx.globalCompositeOperation = 'destination-in';
  rCtx.filter = 'blur(1.5px)';
  rCtx.drawImage(maskImg, 0, 0, w, h);
  rCtx.restore();

  // 4. Extraer píxeles reales de la foto original donde aplica oclusión
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) return null;

  oCtx.drawImage(regionCanvas, 0, 0, w, h);
  oCtx.globalCompositeOperation = 'source-in';
  oCtx.drawImage(photoImg, 0, 0, w, h);

  return outCanvas;
}
