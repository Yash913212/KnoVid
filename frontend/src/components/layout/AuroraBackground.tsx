// Living tangerine/orchid aurora — fixed, ambient, and shared across every
// app route. All animation lives in index.css (.ambient-* / .ambient-grid),
// so it stays cheap and honours prefers-reduced-motion.
export default function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0a0a]" />
      <div className="absolute -left-40 -top-48 h-[600px] w-[600px] rounded-full blur-[150px] opacity-15 bg-[radial-gradient(circle,_#FF6B35,_transparent_70%)] animate-[aurora-breathe_20s_ease-in-out_infinite]" />
      <div className="absolute -right-60 top-[8%] h-[600px] w-[600px] rounded-full blur-[150px] opacity-15 bg-[radial-gradient(circle,_#D946EF,_transparent_70%)] animate-[aurora-breathe_24s_ease-in-out_infinite_reverse]" />
      <div className="absolute -bottom-64 left-[18%] h-[600px] w-[800px] rounded-full blur-[150px] opacity-15 bg-[radial-gradient(circle,_#FF6B35,_transparent_70%)] animate-[aurora-breathe_28s_ease-in-out_infinite]" />
      <div className="ambient-grid absolute inset-0" />
    </div>
  )
}