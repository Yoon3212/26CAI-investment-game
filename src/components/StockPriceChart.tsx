interface PricePoint {
  round: number
  yearLabel: number
  price: number
}

interface StockPriceChartProps {
  series: PricePoint[]
}

const WIDTH = 380
const HEIGHT = 160
const PAD = 10

export default function StockPriceChart({ series }: StockPriceChartProps) {
  if (series.length === 0) return null

  const prices = series.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const stepX = series.length > 1 ? (WIDTH - PAD * 2) / (series.length - 1) : 0

  const points = series.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (1 - (p.price - min) / range) * (HEIGHT - PAD * 2),
    ...p,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${HEIGHT} L${points[0].x},${HEIGHT} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="종목 가격 추이 차트">
        <line x1="0" y1={PAD} x2={WIDTH} y2={PAD} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={HEIGHT - PAD} x2={WIDTH} y2={HEIGHT - PAD} stroke="var(--pp-line)" strokeWidth={1} />
        <path d={areaPath} fill="var(--pp-accent)" opacity={0.1} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--pp-accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.round}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 6 : 3.5}
            fill={i === points.length - 1 ? 'var(--pp-accent)' : 'var(--pp-surface)'}
            stroke="var(--pp-accent)"
            strokeWidth={2}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--pp-ink-dim)', padding: '0 4px' }}>
        {series.map((p) => (
          <span key={p.round}>{p.yearLabel}</span>
        ))}
      </div>
    </div>
  )
}
