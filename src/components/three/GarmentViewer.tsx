import { useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getStorageBlob } from '@/src/firebase/storage';
import type { Garment } from '@/src/types/models';

export type GarmentViewerSource = 'pseudo3d' | 'glb';

interface GarmentViewerProps {
  garment: Garment;
  source?: GarmentViewerSource;
  autoRotate: boolean;
}

function CurvedGarmentMesh({
  textureUrl,
  autoRotate,
}: {
  textureUrl: string;
  autoRotate: boolean;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(2.1, 2.6, 28, 28);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Curvatura suave estilo prenda colgada sobre plano ligeramente convexo
      const zCurve = -0.18 * x * x - 0.04 * y * y + 0.16;
      pos.setZ(i, zCurve);
    }
    geom.computeVertexNormals();
    return geom;
  }, []);

  useEffect(() => {
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.load(textureUrl, (loaded) => {
      if (!active) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
      setTexture(loaded);
    });

    return () => {
      active = false;
    };
  }, [textureUrl]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useFrame((_state, delta) => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y = Math.sin(performance.now() * 0.0007) * 0.35;
    } else if (meshRef.current) {
      meshRef.current.rotation.y = THREE.MathUtils.damp(meshRef.current.rotation.y, 0, 5, delta);
    }
  });

  if (!texture) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.08}
        roughness={0.75}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function GarmentViewer({
  garment,
  source = 'pseudo3d',
  autoRotate,
}: GarmentViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // EXTENSION PHASE 3: Cuando source === 'glb' y exista garment.glbUrl, renderizar escena useGLTF aquí.
  const activeSource = source === 'glb' ? 'pseudo3d' : source;

  useEffect(() => {
    let cancelled = false;
    let localUrl: string | null = null;
    setLoadError(false);

    void getStorageBlob(garment.cutoutPath || garment.imageFullPath)
      .then((blob) => {
        if (cancelled) return;
        localUrl = URL.createObjectURL(blob);
        setObjectUrl(localUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [garment.cutoutPath, garment.imageFullPath]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm text-[#6B6580]">
        No se pudo cargar la textura de la prenda para la vista pseudo-3D.
      </div>
    );
  }

  if (!objectUrl || activeSource !== 'pseudo3d') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 3.6], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.95} />
      <hemisphereLight args={['#FFFBFD', '#E6E0F8', 0.7]} />
      <directionalLight position={[2.5, 3.5, 4]} intensity={1.1} color="#FFF8F0" />
      <directionalLight position={[-2.5, -1, -2]} intensity={0.45} color="#E6E0F8" />
      <CurvedGarmentMesh textureUrl={objectUrl} autoRotate={autoRotate} />
      <OrbitControls
        enablePan={false}
        minDistance={2.2}
        maxDistance={5.2}
        minPolarAngle={Math.PI * 0.25}
        maxPolarAngle={Math.PI * 0.75}
        enableDamping
        dampingFactor={0.07}
      />
    </Canvas>
  );
}
