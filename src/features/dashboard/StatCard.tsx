import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: ReactNode
  tone: string
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  )
}
