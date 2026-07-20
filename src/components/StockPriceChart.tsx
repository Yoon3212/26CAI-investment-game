interface PricePoint {
  round: number
  yearLabel: number
  price: number
}

interface StockPriceChartProps {
  series: PricePoint[]
}

const WIDTH = 380
const HEIGHT = 180
const PAD = 12
const LABEL_MARGIN = 20

export default function StockPriceChart({ series }: StockPriceChartProps) {
  if (series.length === 0) return null

  const prices = series.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const stepX = series.length > 1 ? (WIDTH - PAD * 2) / (series.length - 1) : 0
  const plotTop = PAD + LABEL_MARGIN
  const plotBottom = HEIGHT - PAD - LABEL_MARGIN

  const points = series.map((p, i) => ({
    x: PAD + i * stepX,
    y: plotTop + (1 - (p.price - min) / range) * (plotBottom - plotTop),
    ...p,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${plotBottom} L${points[0].x},${plotBottom} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="종목 가격 추이 차트">
        <line x1="0" y1={plotTop} x2={WIDTH} y2={plotTop} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={(plotTop + plotBottom) / 2} x2={WIDTH} y2={(plotTop + plotBottom) / 2} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={plotBottom} x2={WIDTH} y2={plotBottom} stroke="var(--pp-line)" strokeWidth={1} />
        <path d={areaPath} fill="var(--pp-accent)" opacity={0.1} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--pp-accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const isLast = i === points.length - 1
          const isFirst = i === 0
          const labelAbove = i % 2 === 0
          const textAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle'
          return (
            <g key={p.round}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 6 : 3.5}
                fill={isLast ? 'var(--pp-accent)' : 'var(--pp-surface)'}
                stroke="var(--pp-accent)"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={labelAbove ? p.y - 10 : p.y + 18}
                textAnchor={textAnchor}
                fontSize={isLast ? 11 : 9.5}
                fontWeight={isLast ? 800 : 600}
                fill={isLast ? 'var(--pp-accent)' : 'var(--pp-ink-dim)'}
              >
                {p.price.toLocaleString()}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--pp-ink-dim)', padding: '0 4px' }}>
        {series.map((p) => (
          <span key={p.round}>{p.yearLabel}</span>
        ))}
      </div>
    </div>
  )
}
