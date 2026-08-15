import type { ReactNode } from 'react'

export default function FeatureCard({
  index,
  icon,
  eyebrow,
  title,
  description,
  accent = 'lime',
}: {
  index: string
  icon: ReactNode
  eyebrow: string
  title: string
  description: string
  accent?: 'lime' | 'orchid' | 'coral' | 'violet'
}) {
  return (
    <article className={`feature-card shine-card feature-card-${accent}`}>
      <div className="feature-card-topline">
        <span className="feature-number">{index}</span>
        <span className="feature-icon">{icon}</span>
      </div>
      <p className="feature-eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="feature-description">{description}</p>
      <span className="feature-arrow" aria-hidden="true">↗</span>
    </article>
  )
}
