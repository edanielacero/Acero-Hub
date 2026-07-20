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


const PrismaBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-aia" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#08090a" />
        <stop offset="100%" stopColor="#0c0d10" />
      </linearGradient>
      <linearGradient id="prisma-face-1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e5a000" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#00b8d4" stopOpacity="0.15" />
      </linearGradient>
      <linearGradient id="prisma-face-2" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#d946ef" stopOpacity="0.12" />
      </linearGradient>
      <radialGradient id="glow-aia" cx="50%" cy="50%" r="35%">
        <stop offset="0%" stopColor="#e5a000" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#e5a000" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-aia)" />
    <rect width="400" height="120" fill="url(#glow-aia)" />
    {/* Dot pattern */}
    {Array.from({ length: 160 }, (_, k) => {
      const i = Math.floor(k / 20)
      const j = k % 20
      return <circle key={k} cx={j * 20 + 10} cy={i * 15 + 8} r="0.5" fill="#ffffff" fillOpacity="0.04" />
    })}
    {/* Prisma — geometric icosahedron */}
    <polygon points="200,28 220,48 212,72 188,72 180,48" fill="url(#prisma-face-1)" stroke="#e5a000" strokeWidth="0.6" strokeOpacity="0.4" />
    <polygon points="200,28 220,48 235,38 218,22" fill="url(#prisma-face-2)" stroke="#8b5cf6" strokeWidth="0.5" strokeOpacity="0.3" />
    <polygon points="200,28 180,48 165,38 182,22" fill="url(#prisma-face-2)" stroke="#00b8d4" strokeWidth="0.5" strokeOpacity="0.3" />
    <polygon points="220,48 212,72 232,62" fill="url(#prisma-face-1)" stroke="#e5a000" strokeWidth="0.4" strokeOpacity="0.2" />
    <polygon points="180,48 188,72 168,62" fill="url(#prisma-face-1)" stroke="#00b8d4" strokeWidth="0.4" strokeOpacity="0.2" />
    {/* Refraction lines */}
    <line x1="200" y1="72" x2="200" y2="95" stroke="#e5a000" strokeWidth="0.5" strokeOpacity="0.15" />
    <line x1="188" y1="72" x2="175" y2="92" stroke="#00b8d4" strokeWidth="0.5" strokeOpacity="0.1" />
    <line x1="212" y1="72" x2="225" y2="92" stroke="#8b5cf6" strokeWidth="0.5" strokeOpacity="0.1" />
    {/* Label */}
    <rect x="155" y="88" width="90" height="18" rx="4" fill="#e5a000" fillOpacity="0.06" />
    <text x="200" y="100" textAnchor="middle" fill="#e5a000" fontSize="9" fontFamily="system-ui" fontWeight="600" opacity="0.5" letterSpacing="2">ACERO IA</text>
  </svg>
)

const PrismaIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 20,8 17,18 7,18 4,8" />
    <line x1="12" y1="2" x2="17" y2="18" />
    <line x1="12" y1="2" x2="7" y2="18" />
    <line x1="4" y1="8" x2="20" y2="8" />
  </svg>
)

const DailyBanner = () => (
  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-daily" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0b0b0b" />
        <stop offset="100%" stopColor="#080808" />
      </linearGradient>
      <radialGradient id="glow-daily" cx="50%" cy="45%" r="42%">
        <stop offset="0%" stopColor="#d4d4d4" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#d4d4d4" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="120" fill="url(#bg-daily)" />
    <rect width="400" height="120" fill="url(#glow-daily)" />
    {/* Document body */}
    <rect x="163" y="16" width="74" height="90" rx="5" fill="#0f0f0f" stroke="#1e1e1e" strokeWidth="1" />
    {/* Clip tab */}
    <rect x="185" y="10" width="30" height="11" rx="2.5" fill="#111" stroke="#1e1e1e" strokeWidth="1" />
    {/* Header line */}
    <line x1="175" y1="36" x2="225" y2="36" stroke="#2c2c2c" strokeWidth="1.5" strokeLinecap="round" />
    {/* Body lines */}
    <line x1="175" y1="46" x2="220" y2="46" stroke="#222" strokeWidth="1" strokeLinecap="round" />
    <line x1="175" y1="54" x2="215" y2="54" stroke="#1d1d1d" strokeWidth="1" strokeLinecap="round" />
    {/* Divider */}
    <line x1="175" y1="64" x2="225" y2="64" stroke="#2c2c2c" strokeWidth="1.5" strokeLinecap="round" />
    {/* Check rows */}
    <polyline points="175,74 178,77 184,71" fill="none" stroke="#e0e0e0" strokeWidth="1.1" strokeOpacity="0.4" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="188" y1="74" x2="220" y2="74" stroke="#242424" strokeWidth="1" strokeLinecap="round" />
    <polyline points="175,84 178,87 184,81" fill="none" stroke="#666" strokeWidth="1" strokeOpacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="188" y1="84" x2="217" y2="84" stroke="#1e1e1e" strokeWidth="1" strokeLinecap="round" />
    {/* Label strip */}
    <rect x="152" y="96" width="96" height="14" rx="3" fill="#111" />
    <text x="200" y="106" textAnchor="middle" fill="#333" fontSize="7.5" fontFamily="monospace" fontWeight="600" letterSpacing="3">DAILY</text>
  </svg>
)

const DailyIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const PROJECT_ASSETS: Record<string, ProjectAssets> = {
  'trading-journal': {
    icon: <CandlestickIcon />,
    banner: <TradingBanner />,
  },
  'daily': {
    icon: <DailyIcon />,
    banner: <DailyBanner />,
  },
}
