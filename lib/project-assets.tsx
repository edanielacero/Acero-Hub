import { ReactNode } from 'react'

interface ProjectAssets {
  /** Título de la tarjeta en el Hub. */
  name: string
  description: string
  icon: ReactNode
  banner: ReactNode
}

const TradingBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-tj" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0d1520" />
        <stop offset="100%" stopColor="#080f18" />
      </linearGradient>
      <linearGradient id="lineGrad-tj" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
        <stop offset="40%" stopColor="#22c55e" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#22c55e" stopOpacity="1" />
      </linearGradient>
      <linearGradient id="areaGrad-tj" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-tj)" />
    <line x1="0" y1="30"  x2="400" y2="30"  stroke="#ffffff" strokeOpacity="0.03" strokeWidth="1" />
    <line x1="0" y1="60"  x2="400" y2="60"  stroke="#ffffff" strokeOpacity="0.03" strokeWidth="1" />
    <line x1="0" y1="90"  x2="400" y2="90"  stroke="#ffffff" strokeOpacity="0.03" strokeWidth="1" />
    <path d="M0,90 L40,82 L80,75 L120,68 L160,72 L200,58 L240,50 L280,42 L320,36 L360,28 L400,22 L400,120 L0,120 Z" fill="url(#areaGrad-tj)" />
    <path d="M0,90 L40,82 L80,75 L120,68 L160,72 L200,58 L240,50 L280,42 L320,36 L360,28 L400,22" fill="none" stroke="url(#lineGrad-tj)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="52"  y1="60" x2="52"  y2="88" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="47"  y="66" width="10" height="16" rx="1" fill="#ef4444" fillOpacity="0.8" />
    <line x1="88"  y1="55" x2="88"  y2="80" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="83"  y="58" width="10" height="16" rx="1" fill="#22c55e" fillOpacity="0.8" />
    <line x1="124" y1="52" x2="124" y2="76" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="119" y="56" width="10" height="14" rx="1" fill="#ef4444" fillOpacity="0.8" />
    <line x1="160" y1="46" x2="160" y2="74" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="155" y="50" width="10" height="18" rx="1" fill="#22c55e" fillOpacity="0.8" />
    <line x1="196" y1="38" x2="196" y2="62" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="191" y="42" width="10" height="14" rx="1" fill="#22c55e" fillOpacity="0.8" />
    <line x1="232" y1="34" x2="232" y2="56" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="227" y="37" width="10" height="13" rx="1" fill="#ef4444" fillOpacity="0.8" />
    <line x1="268" y1="26" x2="268" y2="48" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="263" y="29" width="10" height="14" rx="1" fill="#22c55e" fillOpacity="0.8" />
    <line x1="304" y1="20" x2="304" y2="42" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7" />
    <rect x="299" y="22" width="10" height="15" rx="1" fill="#22c55e" fillOpacity="0.8" />
    <rect x="340" y="14" width="52" height="16" rx="3" fill="#22c55e" fillOpacity="0.15" />
    <text x="366" y="25" textAnchor="middle" fill="#22c55e" fontSize="9" fontFamily="monospace" fontWeight="600" opacity="0.9">+2.4%</text>
  </svg>
)

const CandlestickIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="6"  y1="2"  x2="6"  y2="6"  />
    <rect x="3"   y="6"   width="6" height="8" rx="1" />
    <line x1="6"  y1="14" x2="6"  y2="18" />
    <line x1="18" y1="6"  x2="18" y2="9"  />
    <rect x="15"  y="9"   width="6" height="8" rx="1" />
    <line x1="18" y1="17" x2="18" y2="22" />
  </svg>
)


const ExpandlogyBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-exp" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#081014" />
        <stop offset="100%" stopColor="#0a1620" />
      </linearGradient>
      <radialGradient id="glow-exp" cx="70%" cy="35%" r="45%">
        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.10" />
        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="line-exp" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.9" />
      </linearGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-exp)" />
    <rect width="400" height="120" fill="url(#glow-exp)" />
    {/* Red de clientes convergiendo hacia un hub que expande */}
    <line x1="60" y1="90" x2="220" y2="40" stroke="url(#line-exp)" strokeWidth="1" />
    <line x1="90" y1="70" x2="220" y2="40" stroke="url(#line-exp)" strokeWidth="1" />
    <line x1="80" y1="100" x2="220" y2="40" stroke="url(#line-exp)" strokeWidth="1" />
    <line x1="220" y1="40" x2="300" y2="55" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="1" />
    <line x1="220" y1="40" x2="290" y2="25" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="1" />
    <circle cx="60" cy="90" r="3" fill="#22d3ee" fillOpacity="0.35" />
    <circle cx="90" cy="70" r="3" fill="#22d3ee" fillOpacity="0.35" />
    <circle cx="80" cy="100" r="3" fill="#22d3ee" fillOpacity="0.35" />
    <circle cx="220" cy="40" r="5" fill="#22d3ee" fillOpacity="0.85" />
    <circle cx="300" cy="55" r="3" fill="#22d3ee" fillOpacity="0.5" />
    <circle cx="290" cy="25" r="3" fill="#22d3ee" fillOpacity="0.5" />
    <rect x="150" y="90" width="100" height="16" rx="3" fill="#22d3ee" fillOpacity="0.06" />
    <text x="200" y="101" textAnchor="middle" fill="#22d3ee" fontSize="8" fontFamily="system-ui" fontWeight="600" opacity="0.6" letterSpacing="3">EXPANDLOGY</text>
  </svg>
)

const ExpandlogyIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="18" r="2.3" />
    <circle cx="18" cy="6" r="2.3" />
    <circle cx="19" cy="17" r="1.6" opacity="0.5" />
    <line x1="8" y1="16" x2="16" y2="8" />
    <line x1="18" y1="8.5" x2="18.6" y2="14.5" opacity="0.5" />
  </svg>
)



/* ─── Finanzas ─────────────────────────────────────────────────────────────
   Verde bosque + lima, la identidad de la mini-app (ver
   documentos/finanzas/contexto_ui_finanzas.md §4). */

const FinanzasBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-fz" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#16301F" />
        <stop offset="100%" stopColor="#0D1F15" />
      </linearGradient>
      <linearGradient id="bar-fz" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#C8F169" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#C8F169" stopOpacity="0.95" />
      </linearGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-fz)" />
    <circle cx="330" cy="30" r="70" fill="#C8F169" fillOpacity="0.05" />
    <circle cx="360" cy="96" r="40" fill="#C8F169" fillOpacity="0.04" />
    {[
      { x: 40,  h: 26 }, { x: 72,  h: 42 }, { x: 104, h: 34 }, { x: 136, h: 56 },
      { x: 168, h: 48 }, { x: 200, h: 70 }, { x: 232, h: 62 }, { x: 264, h: 84 },
    ].map(bar => (
      <rect key={bar.x} x={bar.x} y={96 - bar.h} width="16" height={bar.h} rx="5" fill="url(#bar-fz)" />
    ))}
    <line x1="24" y1="96" x2="376" y2="96" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="1" />
    <text x="24" y="34" fill="#C8F169" fontSize="11" fontFamily="system-ui" fontWeight="700" opacity="0.9">
      PATRIMONIO
    </text>
  </svg>
)

const FinanzasIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18V9" />
    <path d="M9 18V5" />
    <path d="M15 18v-7" />
    <path d="M21 18V8" />
    <line x1="2" y1="21" x2="22" y2="21" opacity="0.5" />
  </svg>
)

/* ─── Gas ──────────────────────────────────────────────────────────────────
   Ámbar de combustible sobre un negro cálido, la identidad de la mini-app
   (ver app/gas/theme.css). */

const GasBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-gas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#14110B" />
        <stop offset="100%" stopColor="#0B0C0F" />
      </linearGradient>
      <radialGradient id="glow-gas" cx="50%" cy="80%" r="55%">
        <stop offset="0%" stopColor="#F5A524" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#F5A524" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-gas)" />
    <rect width="400" height="120" fill="url(#glow-gas)" />
    {/* Medidor de combustible: arco vacío, arco lleno y aguja */}
    <path d="M148,96 A52,52 0 0 1 252,96" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="7" strokeLinecap="round" />
    <path d="M148,96 A52,52 0 0 1 252,96" fill="none" stroke="#F5A524" strokeOpacity="0.9" strokeWidth="7" strokeLinecap="round" strokeDasharray="62 170" />
    <line x1="200" y1="96" x2="185" y2="59" stroke="#F5A524" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="200" cy="96" r="4" fill="#F5A524" />
    <text x="140" y="112" fill="#F5A524" fillOpacity="0.45" fontSize="9" fontFamily="system-ui" fontWeight="700">E</text>
    <text x="254" y="112" fill="#F5A524" fillOpacity="0.45" fontSize="9" fontFamily="system-ui" fontWeight="700">F</text>
    <text x="200" y="40" textAnchor="middle" fill="#F5A524" fontSize="10" fontFamily="system-ui" fontWeight="700" opacity="0.55" letterSpacing="6">GAS</text>
  </svg>
)

const GasIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Surtidor: cuerpo, visor, base y manguera */}
    <rect x="3" y="3" width="10" height="18" rx="2" />
    <line x1="2" y1="21" x2="14" y2="21" />
    <rect x="6" y="6.5" width="4" height="3.5" rx="0.6" opacity="0.55" />
    <path d="M13 9h3.2a1.8 1.8 0 0 1 1.8 1.8v6a1.5 1.5 0 0 0 3 0v-5.6L18.4 9" />
  </svg>
)

/**
 * Catálogo de mini-apps tal como se muestran en el Hub.
 *
 * El nombre y la descripción viven acá y no en la tabla `projects` para que el
 * home pueda servirse estático: son texto fijo que solo cambia cuando se
 * despliega código. `projects` sigue siendo la fuente de verdad del CONTROL DE
 * ACCESO — es lo que lee el custom access token hook para armar los permisos
 * del token, así que una mini-app nueva sigue necesitando su fila ahí.
 */
export const PROJECT_ASSETS: Record<string, ProjectAssets> = {
  'trading-journal': {
    name: 'Trading Journal',
    description: 'Registro y análisis de operaciones. Estadísticas de rendimiento, gestión de riesgo y bitácora de decisiones.',
    icon: <CandlestickIcon />,
    banner: <TradingBanner />,
  },
  'expandlogy': {
    name: 'Expandlogy',
    description: 'Organización de clientes, onboarding y generación de creativos/copys con IA',
    icon: <ExpandlogyIcon />,
    banner: <ExpandlogyBanner />,
  },
  'finanzas': {
    name: 'Finanzas',
    description: 'Finanzas personales',
    icon: <FinanzasIcon />,
    banner: <FinanzasBanner />,
  },
  'gas': {
    name: 'Gas',
    description: 'Próximamente',
    icon: <GasIcon />,
    banner: <GasBanner />,
  },
}
