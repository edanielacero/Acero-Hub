import type { Currency } from '@/lib/finanzas/types'

/**
 * Ícono real de cada moneda, embebido.
 *
 * · USD y BOB → banderas circulares de HatScripts/circle-flags (MIT)
 * · USDT, USDC, BTC → logos oficiales de spothq/cryptocurrency-icons (CC0)
 *
 * Van inline y no como `<img src>` por tres razones: no dependen de que un CDN
 * siga vivo, no agregan cinco requests a cada pantalla, y no parpadean al
 * cargar. Los cinco juntos pesan ~4 KB.
 *
 * **No usan `<mask>` ni ningún `id` interno.** Las banderas venían recortadas
 * con una máscara SVG referenciada por id; al repetirse el mismo ícono en la
 * página (hay 9 cuentas en Bs), quedaban 9 elementos con el mismo id y WebKit
 * dejaba de resolver la referencia — la bandera se dibujaba cuadrada en el
 * iPhone. El círculo ahora lo recorta el contenedor por CSS: sin ids, no hay
 * nada que colisionar.
 */
const ICONS: Record<Currency, { viewBox: string; body: React.ReactNode }> = {
  USD: { viewBox: '0 0 512 512', body: <><g><path fill="#eee" d="M256 0h256v64l-32 32 32 32v64l-32 32 32 32v64l-32 32 32 32v64l-256 32L0 448v-64l32-32-32-32v-64z"/><path fill="#d80027" d="M224 64h288v64H224Zm0 128h288v64H256ZM0 320h512v64H0Zm0 128h512v64H0Z"/><path fill="#0052b4" d="M0 0h256v256H0Z"/><path fill="#eee" d="m187 243 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-81 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Zm162-82 57-41h-70l57 41-22-67Zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Z"/></g></> },
  BOB: { viewBox: '0 0 512 512', body: <><g><path fill="#ffda44" d="m0 167 252.9-29.3L512 167v178l-255.7 25.7L0 345z"/><path fill="#d80027" d="M0 0h512v167H0z"/><path fill="#6da544" d="M0 345h512v167H0z"/></g></> },
  USDT: { viewBox: '0 0 32 32', body: <><g fill="none" fillRule="evenodd"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path fill="#FFF" d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"/></g></> },
  USDC: { viewBox: '0 0 32 32', body: <><g fill="none"><circle fill="#3E73C4" cx="16" cy="16" r="16"/><g fill="#FFF"><path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z"/><path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z"/></g></g></> },
  BTC: { viewBox: '0 0 32 32', body: <><g fill="none" fillRule="evenodd"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#FFF" fillRule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/></g></> },
}

const LABELS: Record<Currency, string> = {
  USD: 'Dólares', BOB: 'Bolivianos', USDT: 'Tether', USDC: 'USD Coin', BTC: 'Bitcoin',
}

export function CurrencyIcon({ currency, size = 32 }: { currency: Currency; size?: number }) {
  const icon = ICONS[currency]

  return (
    <span
      role="img"
      aria-label={LABELS[currency]}
      className="inline-flex shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        // clip-path además de overflow+radius: WebKit no siempre recorta por
        // border-radius cuando el elemento comparte contexto con un
        // backdrop-filter, y el ícono aparecía cuadrado en el iPhone.
        clipPath: 'circle(50%)',
        // El aro que le da filo sobre canvas claro. Antes era un <circle>
        // dentro del SVG; en CSS escala solo y no depende del viewBox.
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)',
      }}
    >
      <svg width={size} height={size} viewBox={icon.viewBox} aria-hidden focusable="false">
        {icon.body}
      </svg>
    </span>
  )
}
