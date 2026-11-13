/**
 * Contrato de extensión para prueba virtual (Virtual Try-On).
 *
 * // EXTENSION PHASE 3: Conectar opcionalmente a un flujo con consentimiento explícito
 * del usuario y verificación de privacidad sin nombrar ni acoplar proveedores de pago.
 */
export interface TryOnGenerateInput {
  personImage: Blob;
  garmentImage: Blob;
}

export interface TryOnProvider {
  readonly id: string;
  generate: (input: TryOnGenerateInput) => Promise<Blob>;
}

// EXTENSION PHASE 3: Interfaz preparada para futura implementación verificada sin proveedores de pago.
export const tryOnProvider: TryOnProvider = {
  id: 'phase3-try-on-stub',
  async generate(_input: TryOnGenerateInput): Promise<Blob> {
    throw new Error('EXTENSION PHASE 3: La prueba virtual avanzada está reservada para la Fase 3.');
  },
};
