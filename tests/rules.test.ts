import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'closetly-rules-test';

let testEnv: RulesTestEnvironment;

function validGarmentPayload(userId: string) {
  return {
    userId,
    name: 'Blusa lino pastel',
    category: 'top',
    dominantColor: '#FADADD',
    season: ['spring', 'summer'],
    occasion: ['casual'],
    tags: ['lino', 'fresco'],
    imageFullPath: `garments/${userId}/g1_full.webp`,
    imageThumbPath: `garments/${userId}/g1_thumb.webp`,
    cutoutPath: `garments/${userId}/g1_cutout.webp`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function validOutfitPayload(userId: string) {
  return {
    userId,
    name: 'Look primavera oficina',
    occasion: 'trabajo',
    collection: 'work',
    items: [
      {
        garmentId: 'g1',
        layer: 'top',
        slotKey: 'top',
        anchor: { x: 0.5, y: 0.35 },
        transform: { scale: 1, rotation: 0 },
      },
    ],
    previewPath: `outfits/${userId}/o1_preview.webp`,
    createdAt: serverTimestamp(),
  };
}

describe('Closetly Firestore & Storage Security Rules', () => {
  beforeAll(async () => {
    const firestoreRules = readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const storageRules = readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: firestoreRules,
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: storageRules,
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('(a) usuario B no puede leer ni escribir datos de usuario A', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const bobCtx = testEnv.authenticatedContext('userB', { email: 'b@closetly.app', email_verified: true });
    const anonCtx = testEnv.unauthenticatedContext();

    const aliceDb = aliceCtx.firestore();
    const bobDb = bobCtx.firestore();
    const anonDb = anonCtx.firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', 'userA'), {
        displayName: 'Alice',
        email: 'a@closetly.app',
        createdAt: serverTimestamp(),
      }),
    );

    await assertSucceeds(setDoc(doc(aliceDb, 'garments', 'g1'), validGarmentPayload('userA')));
    await assertSucceeds(setDoc(doc(aliceDb, 'outfits', 'o1'), validOutfitPayload('userA')));

    // Lecturas no autenticadas o cruzadas deben fallar
    await assertFails(getDoc(doc(anonDb, 'garments', 'g1')));
    await assertFails(getDoc(doc(bobDb, 'users', 'userA')));
    await assertFails(getDoc(doc(bobDb, 'garments', 'g1')));
    await assertFails(getDoc(doc(bobDb, 'outfits', 'o1')));
    await assertFails(getDocs(query(collection(bobDb, 'garments'), where('userId', '==', 'userA'))));

    // Escrituras cruzadas o suplantación de userId deben fallar
    await assertFails(setDoc(doc(bobDb, 'garments', 'g2'), validGarmentPayload('userA')));
    await assertFails(updateDoc(doc(bobDb, 'garments', 'g1'), { name: 'Hackeada' }));
    await assertFails(getDocs(collection(aliceDb, 'users')));
  });

  it('(b) no se puede cambiar userId en update ni inyectar campos fantasma', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertSucceeds(setDoc(doc(aliceDb, 'garments', 'g1'), validGarmentPayload('userA')));

    // Intentar reasignar userId debe fallar
    await assertFails(
      updateDoc(doc(aliceDb, 'garments', 'g1'), {
        userId: 'userB',
        updatedAt: serverTimestamp(),
      }),
    );

    // Intentar agregar un campo no permitido debe fallar
    await assertFails(
      updateDoc(doc(aliceDb, 'garments', 'g1'), {
        isAdmin: true,
        updatedAt: serverTimestamp(),
      }),
    );

    // Update legítimo permitido
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'garments', 'g1'), {
        name: 'Blusa lino lavanda',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('(c) categoría inválida, accessory sin slot y colección inválida son rechazadas', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    // Categoría inválida
    await assertFails(
      setDoc(doc(aliceDb, 'garments', 'g-bad-cat'), {
        ...validGarmentPayload('userA'),
        category: 'hat',
      }),
    );

    // Accesorio sin accessorySlot
    await assertFails(
      setDoc(doc(aliceDb, 'garments', 'g-acc-no-slot'), {
        ...validGarmentPayload('userA'),
        category: 'accessory',
      }),
    );

    // Accesorio válido con accessorySlot
    await assertSucceeds(
      setDoc(doc(aliceDb, 'garments', 'g-acc-ok'), {
        ...validGarmentPayload('userA'),
        category: 'accessory',
        accessorySlot: 'neck',
      }),
    );

    // Nombre mayor a 80 chars
    await assertFails(
      setDoc(doc(aliceDb, 'garments', 'g-long-name'), {
        ...validGarmentPayload('userA'),
        name: 'A'.repeat(81),
      }),
    );

    // Colección de outfit inválida
    await assertFails(
      setDoc(doc(aliceDb, 'outfits', 'o-bad-col'), {
        ...validOutfitPayload('userA'),
        collection: 'vip',
      }),
    );

    // Outfit con más de 8 items
    await assertFails(
      setDoc(doc(aliceDb, 'outfits', 'o-too-many'), {
        ...validOutfitPayload('userA'),
        items: Array.from({ length: 9 }, (_, i) => ({
          garmentId: `g${i}`,
          layer: 'top',
          slotKey: 'top',
          anchor: { x: 0.5, y: 0.5 },
          transform: { scale: 1, rotation: 0 },
        })),
      }),
    );
  });

  it('(d) template3d fuera de la lista cerrada es rechazado', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'garments', 'g-bad-tpl'), {
        ...validGarmentPayload('userA'),
        template3d: 'cape',
      }),
    );

    await assertSucceeds(
      setDoc(doc(aliceDb, 'garments', 'g-ok-tpl'), {
        ...validGarmentPayload('userA'),
        template3d: 'tshirt',
      }),
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'garments', 'g-ok-tpl'), {
        template3d: 'invalid_3d_mesh',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('(f) avatarConfig.renderer acepta "photo" en users/{uid}', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', 'userA'), {
        displayName: 'Alice',
        email: 'a@closetly.app',
        createdAt: serverTimestamp(),
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'regular',
          height: 'average',
          renderer: 'photo',
        },
      }),
    );

    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users', 'userA'), {
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'slim',
          height: 'tall',
          renderer: 'photo',
        },
      }),
    );
  });

  it('(g) avatarConfig.renderer rechaza "rpm" y "hologram" en users/{uid}', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', 'userA'), {
        displayName: 'Alice',
        email: 'a@closetly.app',
        createdAt: serverTimestamp(),
      }),
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'users', 'userA'), {
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'regular',
          height: 'average',
          renderer: 'rpm',
        },
      }),
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'users', 'userA'), {
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'regular',
          height: 'average',
          renderer: 'hologram',
        },
      }),
    );
  });

  it('(h) renderer ausente se rechaza al crear avatarConfig en users/{uid}', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'users', 'userA'), {
        displayName: 'Alice',
        email: 'a@closetly.app',
        createdAt: serverTimestamp(),
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'regular',
          height: 'average',
        },
      }),
    );
  });

  it('(i) outfits acepta items con photoTransform opcional y tests previos de Storage/Lookbook siguen pasando', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'outfits', 'o-photo-transform'), {
        ...validOutfitPayload('userA'),
        items: [
          {
            garmentId: 'g1',
            layer: 'top',
            slotKey: 'top',
            anchor: { x: 0.5, y: 0.35 },
            transform: { scale: 1, rotation: 0 },
            photoTransform: { cx: 0.5, cy: 0.42, scale: 0.85, rotation: 5, flipX: false },
          },
        ],
      }),
    );

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', 'userA'), {
        displayName: 'Alice',
        email: 'a@closetly.app',
        createdAt: serverTimestamp(),
        avatarConfig: {
          skin: '#E8B89A',
          hair: { style: 'wavy', color: '#4E3830' },
          body: 'regular',
          height: 'average',
          renderer: '2d',
        },
      }),
    );
  });

  it('(j) Storage: solo el propietario lee/escribe y valida tipo MIME + tamaño < 3 MB', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const bobCtx = testEnv.authenticatedContext('userB', { email: 'b@closetly.app', email_verified: true });
    const anonCtx = testEnv.unauthenticatedContext();

    const aliceStorage = aliceCtx.storage();
    const bobStorage = bobCtx.storage();
    const anonStorage = anonCtx.storage();

    const validBytes = new Uint8Array([1, 2, 3, 4]);
    const aliceGarmentRef = ref(aliceStorage, 'garments/userA/g1_cutout.webp');

    // Propietario puede subir WebP < 3 MB
    await assertSucceeds(uploadBytes(aliceGarmentRef, validBytes, { contentType: 'image/webp' }));

    // Propietario puede leer
    await assertSucceeds(getBytes(aliceGarmentRef));

    // Usuario B y anónimo NO pueden leer ni escribir archivos de A
    await assertFails(getBytes(ref(bobStorage, 'garments/userA/g1_cutout.webp')));
    await assertFails(getBytes(ref(anonStorage, 'garments/userA/g1_cutout.webp')));
    await assertFails(
      uploadBytes(ref(bobStorage, 'garments/userA/g2_cutout.webp'), validBytes, {
        contentType: 'image/webp',
      }),
    );

    // Content-Type inválido (no imagen) debe fallar
    await assertFails(
      uploadBytes(ref(aliceStorage, 'garments/userA/bad.txt'), validBytes, {
        contentType: 'text/plain',
      }),
    );

    // Archivo >= 3 MB debe fallar
    const oversized = new Uint8Array(3 * 1024 * 1024 + 10);
    await assertFails(
      uploadBytes(ref(aliceStorage, 'garments/userA/huge.webp'), oversized, {
        contentType: 'image/webp',
      }),
    );
  });

  it('(k) Lookbook Firestore: privacidad estricta, validaciones y foto inmutable en update', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const bobCtx = testEnv.authenticatedContext('userB', { email: 'b@closetly.app', email_verified: true });
    const aliceDb = aliceCtx.firestore();
    const bobDb = bobCtx.firestore();

    const validEntry = {
      userId: 'userA',
      outfitId: 'o1',
      outfitSnapshot: {
        name: 'Look primavera oficina',
        previewPath: 'outfits/userA/o1_preview.webp',
        items: [{ garmentId: 'g1', layer: 'top', slotKey: 'top' }],
      },
      photoPath: 'lookbook/userA/lb1.webp',
      photoThumbPath: 'lookbook/userA/lb1_thumb.webp',
      wornOn: '2026-11-12',
      note: 'Muy cómodo para la oficina',
      consentVersion: 1,
      createdAt: serverTimestamp(),
    };

    await assertSucceeds(setDoc(doc(aliceDb, 'lookbook', 'lb1'), validEntry));

    // Usuario B no lee, ni crea ni actualiza lookbook de A
    await assertFails(getDoc(doc(bobDb, 'lookbook', 'lb1')));
    await assertFails(getDocs(query(collection(bobDb, 'lookbook'), where('userId', '==', 'userA'))));
    await assertFails(setDoc(doc(bobDb, 'lookbook', 'lb-bob-forged'), validEntry));
    await assertFails(updateDoc(doc(bobDb, 'lookbook', 'lb1'), { note: 'Intrusión' }));

    // Validaciones en create (nota > 200, consentimiento != 1, fecha inválida)
    await assertFails(
      setDoc(doc(aliceDb, 'lookbook', 'lb-long-note'), {
        ...validEntry,
        note: 'x'.repeat(201),
      }),
    );
    await assertFails(
      setDoc(doc(aliceDb, 'lookbook', 'lb-no-consent'), {
        ...validEntry,
        consentVersion: 2,
      }),
    );
    await assertFails(
      setDoc(doc(aliceDb, 'lookbook', 'lb-bad-date'), {
        ...validEntry,
        wornOn: '12-11-2026',
      }),
    );

    // Foto INMUTABLE en update: cambiar photoPath o photoThumbPath debe fallar
    await assertFails(
      updateDoc(doc(aliceDb, 'lookbook', 'lb1'), {
        photoPath: 'lookbook/userA/other.webp',
      }),
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'lookbook', 'lb1'), {
        photoThumbPath: 'lookbook/userA/other_thumb.webp',
      }),
    );

    // Actualizar nota sí está permitido
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'lookbook', 'lb1'), {
        note: 'Nota editada del lookbook',
      }),
    );
  });

  it('(l) Lookbook Storage: límite 5 MB y acceso exclusivo del propietario', async () => {
    const aliceCtx = testEnv.authenticatedContext('userA', { email: 'a@closetly.app', email_verified: true });
    const bobCtx = testEnv.authenticatedContext('userB', { email: 'b@closetly.app', email_verified: true });
    const aliceStorage = aliceCtx.storage();
    const bobStorage = bobCtx.storage();

    const validBytes = new Uint8Array([1, 2, 3, 4]);
    const aliceLookRef = ref(aliceStorage, 'lookbook/userA/lb1.webp');

    await assertSucceeds(uploadBytes(aliceLookRef, validBytes, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(aliceLookRef));
    await assertFails(getBytes(ref(bobStorage, 'lookbook/userA/lb1.webp')));
    await assertFails(
      uploadBytes(ref(bobStorage, 'lookbook/userA/lb2.webp'), validBytes, {
        contentType: 'image/webp',
      }),
    );

    const oversized = new Uint8Array(5 * 1024 * 1024 + 10);
    await assertFails(
      uploadBytes(ref(aliceStorage, 'lookbook/userA/huge.webp'), oversized, {
        contentType: 'image/webp',
      }),
    );
  });
});
