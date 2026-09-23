import { useEffect, useRef } from 'react';

interface QrApi {
  encode: (text: string, level?: string) => unknown;
  svg: (qr: unknown, opt?: { quiet?: number; fg?: string; bg?: string }) => string;
}

/**
 * QR-koodi otpauth-osoitteelle. Käyttää työkalumoottorin mukana tulevaa
 * generaattoria; jos sitä ei ole vielä ladattu, näytetään pelkkä avain.
 */
export function QrCode({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const api = (window as unknown as { QR?: QrApi }).QR;
    if (!el || !api) return;
    try {
      el.innerHTML = api.svg(api.encode(value, 'M'), { quiet: 2 });
    } catch {
      el.textContent = '';
    }
    return () => {
      el.innerHTML = '';
    };
  }, [value]);

  return <div className="qr" ref={ref} />;
}
