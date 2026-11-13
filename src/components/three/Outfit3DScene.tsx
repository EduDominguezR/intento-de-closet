import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Avatar3D,
  computeFittedCameraFrame,
  createSoftContactShadowTexture,
} from '@/src/components/three/Avatar3D';
import { Garment3D } from '@/src/components/three/Garment3D';
import { parametricAvatarProvider } from '@/src/lib/avatar/provider';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import type { ModelsManifest } from '@/src/lib/three/models';
import type { Garment } from '@/src/types/models';

export interface Outfit3DSceneHandle {
  rotateBy: (deltaAzimuthRad: number) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  captureWebP: () => Promise<Blob>;
}

export interface Outfit3DSceneProps {
  avatarConfig: AvatarConfig;
  garments: Garment[];
  manifest: ModelsManifest | null;
  isSoftwareGl: boolean;
  reducedMotion: boolean;
  onLowPerformanceFallback?: () => void;
}

// Objetos reutilizables fuera del loop de render para evitar GC por frame
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _targetDefault = new THREE.Vector3(0, 0.78, 0);
const _cameraDefault = new THREE.Vector3(0, 0.9, 3.45);

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
      <fog attach="fog" args={['#FFFBFD', 7.5, 16]} />
      <hemisphereLight args={['#F7F3FF', '#F3E5EC', 1.08]} />
      <directionalLight
        position={[1.8, 3.4, 2.5]}
        intensity={1.25}
        color="#FFF8F0"
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-1.15}
        shadow-camera-right={1.15}
        shadow-camera-top={2.15}
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

export const Outfit3DScene = forwardRef<Outfit3DSceneHandle, Outfit3DSceneProps>(
  function Outfit3DScene(
    { avatarConfig, garments, manifest, isSoftwareGl, reducedMotion, onLowPerformanceFallback },
    ref,
  ) {
    const { gl, scene, camera, size } = useThree();
    const controlsRef = useRef<OrbitControlsImpl | null>(null);

    const { params3D } = useMemo(
      () => parametricAvatarProvider.resolveParametric(avatarConfig),
      [avatarConfig],
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
          maxWidth: 0.68 * params3D.proportions.hipScaleX,
          fovDeg: 36,
          aspect: size.width / Math.max(1, size.height),
          bottomOverlayRatio: 0.14,
        }),
      [
        params3D.proportions.hipScaleX,
        params3D.proportions.totalHeightMeters,
        size.height,
        size.width,
      ],
    );

    // Sincronizar vectores por defecto con el encuadre calculado para este tamaño de panel
    useEffect(() => {
      _targetDefault.set(0, frame.targetY, 0);
      _cameraDefault.set(0, frame.cameraY, frame.distance);
    }, [frame.cameraY, frame.distance, frame.targetY]);

    // Encuadrar automáticamente al montar o al cambiar el tamaño del panel / estatura
    // si el usuario no ha rotado manualmente la cámara todavía
    const userInteractedRef = useRef(false);
    const initializedRef = useRef(false);
    useEffect(() => {
      if (!initializedRef.current || !userInteractedRef.current) {
        camera.position.set(0, frame.cameraY, frame.distance);
        const controls = controlsRef.current;
        if (controls) {
          controls.target.set(0, frame.targetY, 0);
          controls.update();
        }
        initializedRef.current = true;
      }
    }, [camera, frame.cameraY, frame.distance, frame.targetY]);

    // Estado de animación suave de cámara para botones accesibles (sin asignaciones en useFrame)
    const targetAzimuthDeltaRef = useRef(0);
    const targetDistanceRef = useRef<number | null>(null);
    const resettingRef = useRef(false);

    // Monitor de FPS en GPU reales: si el promedio cae bajo 15 fps durante > 3 s tras el arranque
    const mountTimeRef = useRef(performance.now());
    const lowFpsSinceRef = useRef<number | null>(null);
    const fallbackTriggeredRef = useRef(false);
    const frameWindowRef = useRef({ frames: 0, elapsed: 0 });

    useImperativeHandle(
      ref,
      () => ({
        rotateBy(deltaAzimuthRad: number) {
          userInteractedRef.current = true;
          resettingRef.current = false;
          if (reducedMotion) {
            const controls = controlsRef.current;
            if (!controls) return;
            _offset.copy(camera.position).sub(controls.target);
            _spherical.setFromVector3(_offset);
            _spherical.theta += deltaAzimuthRad;
            _offset.setFromSpherical(_spherical);
            camera.position.copy(controls.target).add(_offset);
            controls.update();
          } else {
            targetAzimuthDeltaRef.current += deltaAzimuthRad;
          }
        },
        zoomBy(factor: number) {
          userInteractedRef.current = true;
          const controls = controlsRef.current;
          if (!controls) return;
          resettingRef.current = false;
          const currentDist = camera.position.distanceTo(controls.target);
          const nextDist = THREE.MathUtils.clamp(
            currentDist * factor,
            frame.minDistance,
            frame.maxDistance,
          );
          if (reducedMotion) {
            _offset.copy(camera.position).sub(controls.target).normalize().multiplyScalar(nextDist);
            camera.position.copy(controls.target).add(_offset);
            controls.update();
          } else {
            targetDistanceRef.current = nextDist;
          }
        },
        resetView() {
          userInteractedRef.current = false;
          targetAzimuthDeltaRef.current = 0;
          targetDistanceRef.current = null;
          _targetDefault.set(0, frame.targetY, 0);
          _cameraDefault.set(0, frame.cameraY, frame.distance);
          if (reducedMotion) {
            const controls = controlsRef.current;
            camera.position.copy(_cameraDefault);
            if (controls) {
              controls.target.copy(_targetDefault);
              controls.update();
            }
          } else {
            resettingRef.current = true;
          }
        },
        captureWebP(): Promise<Blob> {
          return new Promise((resolve, reject) => {
            try {
              controlsRef.current?.update();
              gl.render(scene, camera);
              gl.domElement.toBlob(
                (blob) => {
                  if (blob) resolve(blob);
                  else reject(new Error('No se pudo generar la imagen WebP desde WebGL.'));
                },
                'image/webp',
                0.9,
              );
            } catch (err) {
              reject(err instanceof Error ? err : new Error('Error capturando vista 3D.'));
            }
          });
        },
      }),
      [
        camera,
        frame.cameraY,
        frame.distance,
        frame.maxDistance,
        frame.minDistance,
        frame.targetY,
        gl,
        reducedMotion,
        scene,
      ],
    );

    useFrame((_, delta) => {
      const controls = controlsRef.current;
      const safeDelta = Math.min(delta, 0.1);

      if (controls) {
        if (resettingRef.current) {
          const alpha = 1 - Math.exp(-8 * safeDelta);
          camera.position.lerp(_cameraDefault, alpha);
          controls.target.lerp(_targetDefault, alpha);
          controls.update();
          if (camera.position.distanceTo(_cameraDefault) < 0.01) {
            camera.position.copy(_cameraDefault);
            controls.target.copy(_targetDefault);
            resettingRef.current = false;
          }
        } else if (
          Math.abs(targetAzimuthDeltaRef.current) > 0.001 ||
          targetDistanceRef.current !== null
        ) {
          _offset.copy(camera.position).sub(controls.target);
          _spherical.setFromVector3(_offset);

          if (Math.abs(targetAzimuthDeltaRef.current) > 0.001) {
            const step = THREE.MathUtils.damp(0, targetAzimuthDeltaRef.current, 10, safeDelta);
            _spherical.theta += step;
            targetAzimuthDeltaRef.current -= step;
            if (Math.abs(targetAzimuthDeltaRef.current) <= 0.001) {
              targetAzimuthDeltaRef.current = 0;
            }
          }

          if (targetDistanceRef.current !== null) {
            _spherical.radius = THREE.MathUtils.damp(
              _spherical.radius,
              targetDistanceRef.current,
              10,
              safeDelta,
            );
            if (Math.abs(_spherical.radius - targetDistanceRef.current) < 0.005) {
              _spherical.radius = targetDistanceRef.current;
              targetDistanceRef.current = null;
            }
          }

          _offset.setFromSpherical(_spherical);
          camera.position.copy(controls.target).add(_offset);
          controls.update();
        }
      }

      if (!isSoftwareGl && onLowPerformanceFallback && !fallbackTriggeredRef.current) {
        const now = performance.now();
        if (now - mountTimeRef.current > 2000) {
          frameWindowRef.current.frames += 1;
          frameWindowRef.current.elapsed += delta;

          if (frameWindowRef.current.elapsed >= 0.75) {
            const fps = frameWindowRef.current.frames / frameWindowRef.current.elapsed;
            frameWindowRef.current.frames = 0;
            frameWindowRef.current.elapsed = 0;

            if (fps < 15) {
              if (lowFpsSinceRef.current === null) {
                lowFpsSinceRef.current = now;
              } else if (now - lowFpsSinceRef.current >= 3000) {
                fallbackTriggeredRef.current = true;
                onLowPerformanceFallback();
              }
            } else {
              lowFpsSinceRef.current = null;
            }
          }
        }
      }
    });

    return (
      <>
        <StudioEnvironment isSoftwareGl={isSoftwareGl} />

        {/* Avatar y prendas apoyados exactamente en el suelo y = 0 */}
        <group position={[0, 0, 0]}>
          <Avatar3D config={avatarConfig} manifest={manifest} />

          {garments.map((garment) => (
            <Garment3D
              key={garment.id}
              garment={garment}
              avatarConfig={avatarConfig}
              manifest={manifest}
            />
          ))}

          {/* Sombra circular suave de contacto bajo los pies */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
            <circleGeometry args={[0.48, 40]} />
            <meshBasicMaterial map={contactTexture} transparent depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
            <circleGeometry args={[1.05, 36]} />
            <shadowMaterial transparent opacity={0.14} color="#4A4458" />
          </mesh>
        </group>

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableDamping={!isSoftwareGl && !reducedMotion}
          dampingFactor={0.07}
          minDistance={frame.minDistance}
          maxDistance={frame.maxDistance}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.54}
          target={[0, frame.targetY, 0]}
          onStart={() => {
            userInteractedRef.current = true;
            targetAzimuthDeltaRef.current = 0;
            targetDistanceRef.current = null;
            resettingRef.current = false;
          }}
        />
      </>
    );
  },
);

export default Outfit3DScene;
