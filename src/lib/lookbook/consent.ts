export const CONSENT_VERSION = 1;

const LOOKBOOK_CONSENT_KEY = 'lookbook-consent';

const CONSENT_TEXT =
  'Subo esta foto voluntariamente. Solo yo puedo verla. Se guarda en tu cuenta privada y nunca se comparte. Puedo eliminarla en cualquier momento y se borrará de inmediato.';

export function hasConsent(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(LOOKBOOK_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setConsent(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOOKBOOK_CONSENT_KEY, '1');
    }
  } catch {
    // Ignorar errores de almacenamiento privado
  }
}

export function getConsentText(): string {
  return CONSENT_TEXT;
}
