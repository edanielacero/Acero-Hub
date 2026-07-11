import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Daily',
  description: 'Daily standup report generator',
}

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes daily-in {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes daily-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-5px); }
        }
        @keyframes daily-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes daily-modal-in {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .daily-in      { animation: daily-in  0.15s ease both; }
        .daily-out     { animation: daily-out 0.15s ease both; }
        .daily-overlay { animation: daily-overlay-in 0.18s ease both; }
        .daily-modal   { animation: daily-modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
      {children}
    </>
  )
}
