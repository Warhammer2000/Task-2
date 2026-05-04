import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";

/** Returns a data URL for a QR code rendered at the given options. */
export function useQrDataUrl(value: string | null | undefined, size = 220) {
  const [url, setUrl] = useState<string | null>(null);

  const render = useCallback(async () => {
    if (!value) {
      setUrl(null);
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#4ade80", light: "#0a1a0a" },
      });
      setUrl(dataUrl);
    } catch {
      setUrl(null);
    }
  }, [value, size]);

  useEffect(() => {
    render();
  }, [render]);

  return url;
}
