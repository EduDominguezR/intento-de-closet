import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { parametricAvatarProvider } from '@/src/lib/avatar/provider';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import {
  applyMorphTargets,
  disposeObject3D,
  loadGLBModel,
  type ModelsManifest,
} from '@/src/lib/three/models';
import {
  createProceduralGarmentTemplate,
  getLayerForTemplate,
} from '@/src/lib/three/templates';
import {
  applyTextureProjectionToGroup,
  buildProjectedCutoutTexture,
} from '@/src/lib/three/textureProjection';
import type { Garment } from '@/src/types/models';

export interface Garment3DProps {
  garment: Garment;
  avatarConfig: AvatarConfig;
  manifest: ModelsManifest | null;
}

export function Garment3D({ garment, avatarConfig, manifest }: Garment3DProps) {
  const templateId = garment.template3d;
  const { params3D } = useMemo(
    () => parametricAvatarProvider.resolveParametric(avatarConfig),
    [avatarConfig],
  );

  const [glbGroup, setGlbGroup] = useState<THREE.Group | null>(null);
  const [frontTexture, setFrontTexture] = useState<THREE.CanvasTexture | null>(null);

  // Cargar .glb opcional si manifest lo define
  const templateGlbPath = templateId ? manifest?.templates[templateId]?.glb ?? null : null;

  useEffect(() => {
    let active = true;
    if (!templateId || !templateGlbPath) {
      setGlbGroup(null);
      return;
    }

    void loadGLBModel(templateGlbPath).then((gltf) => {
      if (!active) {
        if (gltf?.scene) disposeObject3D(gltf.scene);
        return;
      }
      if (!gltf?.scene) {
        setGlbGroup(null);
        return;
      }
      setGlbGroup(gltf.scene.clone(true));
    });

    return () => {
      active = false;
    };
  }, [templateGlbPath, templateId]);

  useEffect(() => {
    return () => {
      if (glbGroup) disposeObject3D(glbGroup);
    };
  }, [glbGroup]);

  const proceduralGroup = useMemo(() => {
    if (!templateId || glbGroup) return null;
    return createProceduralGarmentTemplate(templateId, params3D, garment.dominantColor);
  }, [garment.dominantColor, glbGroup, params3D, templateId]);

  useEffect(() => {
    return () => {
      if (proceduralGroup) disposeObject3D(proceduralGroup);
    };
  }, [proceduralGroup]);

  const activeGroup = glbGroup ?? proceduralGroup;
  const frontPanelAspect =
    typeof proceduralGroup?.userData?.frontPanelAspect === 'number'
      ? proceduralGroup.userData.frontPanelAspect
      : 0.85;

  // Cargar textura proyectada con proporción exacta del panel frontal
  useEffect(() => {
    let active = true;
    let loadedTex: THREE.CanvasTexture | null = null;

    if (!templateId) {
      setFrontTexture(null);
      return;
    }

    void buildProjectedCutoutTexture(
      garment.cutoutPath,
      garment.dominantColor,
      frontPanelAspect,
    ).then((tex) => {
      if (!active) {
        tex?.dispose();
        return;
      }
      loadedTex = tex;
      setFrontTexture(tex);
    });

    return () => {
      active = false;
      loadedTex?.dispose();
    };
  }, [frontPanelAspect, garment.cutoutPath, garment.dominantColor, templateId]);

  // Aplicar morph targets (si es GLB) y proyección de textura + orden de capa
  useEffect(() => {
    if (!activeGroup || !templateId) return;
    if (glbGroup && manifest?.avatar?.morphTargets) {
      applyMorphTargets(glbGroup, manifest.avatar.morphTargets, params3D.morphWeights);
    }
    const layer = getLayerForTemplate(templateId);
    applyTextureProjectionToGroup(activeGroup, frontTexture, garment.dominantColor, layer);
  }, [
    activeGroup,
    frontTexture,
    garment.dominantColor,
    glbGroup,
    manifest,
    params3D.morphWeights,
    templateId,
  ]);

  if (!templateId || !activeGroup) return null;

  return <primitive object={activeGroup} />;
}

export default Garment3D;
