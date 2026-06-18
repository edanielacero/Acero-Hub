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

export const PROJECT_ASSETS: Record<string, ProjectAssets> = {
  'trading-journal': {
    icon: <CandlestickIcon />,
    banner: <TradingBanner />,
  },
}
