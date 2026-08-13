import { ReactNode } from 'react'

interface ProjectAssets {
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

const FinanzasBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-fin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#171006" />
        <stop offset="100%" stopColor="#0c0904" />
      </linearGradient>
      <radialGradient id="glow-fin" cx="50%" cy="38%" r="45%">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="card-fin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2a2110" />
        <stop offset="100%" stopColor="#15100a" />
      </linearGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-fin)" />
    <rect width="400" height="120" fill="url(#glow-fin)" />
    {/* Tarjeta */}
    <rect x="152" y="28" width="96" height="60" rx="7" fill="url(#card-fin)" stroke="#3a2e14" strokeWidth="1" />
    <rect x="152" y="43" width="96" height="9" fill="#f59e0b" fillOpacity="0.14" />
    <circle cx="220" cy="71" r="8" fill="#f59e0b" fillOpacity="0.85" />
    <line x1="164" y1="71" x2="196" y2="71" stroke="#4a3a18" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="164" y1="78" x2="184" y2="78" stroke="#3a2e14" strokeWidth="1.5" strokeLinecap="round" />
    {/* Tendencia ascendente */}
    <path d="M42,88 L78,74 L112,80 L146,52" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
    <circle cx="42" cy="88" r="2.3" fill="#f59e0b" fillOpacity="0.6" />
    <circle cx="78" cy="74" r="2.3" fill="#f59e0b" fillOpacity="0.7" />
    <circle cx="112" cy="80" r="2.3" fill="#f59e0b" fillOpacity="0.7" />
    <circle cx="146" cy="52" r="3" fill="#fbbf24" />
    {/* Label */}
    <rect x="150" y="98" width="100" height="14" rx="3" fill="#120d05" />
    <text x="200" y="108" textAnchor="middle" fill="#8a6a24" fontSize="7.5" fontFamily="monospace" fontWeight="600" letterSpacing="3">FINANZAS</text>
  </svg>
)

const FinanzasIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="14" rx="2.5" />
    <path d="M2 10.5h20" />
    <circle cx="17" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

export const PROJECT_ASSETS: Record<string, ProjectAssets> = {
  'trading-journal': {
    icon: <CandlestickIcon />,
    banner: <TradingBanner />,
  },
  'expandlogy': {
    icon: <ExpandlogyIcon />,
    banner: <ExpandlogyBanner />,
  },
  'finanzas': {
    icon: <FinanzasIcon />,
    banner: <FinanzasBanner />,
  },
}
