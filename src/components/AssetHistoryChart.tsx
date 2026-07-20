interface SeriesPoint {
  round: number
  yearLabel: number
  totalAssets: number
}

interface Series {
  nickname: string
  color: string
  points: SeriesPoint[]
}

interface AssetHistoryChartProps {
  series: Series[]
}

const WIDTH = 680
const HEIGHT = 320
const PAD_LEFT = 56
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 36

export default function AssetHistoryChart({ series }: AssetHistoryChartProps) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length === 0) {
    return <p style={{ color: 'var(--pp-ink-dim)', textAlign: 'center', padding: '24px 0' }}>아직 데이터가 없습니다.</p>
  }

  const rounds = Array.from(new Set(allPoints.map((p) => p.round))).sort((a, b) => a - b)
  const values = allPoints.map((p) => p.totalAssets)
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM
  const stepX = rounds.length > 1 ? plotW / (rounds.length - 1) : 0

  function xFor(round: number) {
    const i = rounds.indexOf(round)
    return PAD_LEFT + i * stepX
  }
  function yFor(value: number) {
    return PAD_TOP + (1 - (value - minValue) / range) * plotH
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD_TOP + f * plotH)

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="팀별 누적 자산 그래프">
        {gridLines.map((y) => (
          <line key={y} x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--pp-line)" strokeWidth={1} />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const value = maxValue - f * range
          return (
            <text
              key={f}
              x={PAD_LEFT - 8}
              y={PAD_TOP + f * plotH + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--pp-ink-dim)"
            >
              {Math.round(value / 10000)}만
            </text>
          )
        })}
        {rounds.map((r) => (
          <text
            key={r}
            x={xFor(r)}
            y={HEIGHT - PAD_BOTTOM + 20}
            textAnchor="middle"
            fontSize={11}
            fill="var(--pp-ink-dim)"
          >
            {series[0]?.points.find((p) => p.round === r)?.yearLabel ?? r}
          </text>
        ))}
        {series.map((s) => {
          const linePath = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.round)},${yFor(p.totalAssets)}`).join(' ')
          return (
            <g key={s.nickname}>
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {s.points.map((p) => (
                <circle key={p.round} cx={xFor(p.round)} cy={yFor(p.totalAssets)} r={4} fill={s.color} />
              ))}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center', marginTop: 8 }}>
        {series.map((s) => (
          <span key={s.nickname} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            {s.nickname}
          </span>
        ))}
      </div>
    </div>
  )
}
