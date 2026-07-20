import { useGameState } from '../hooks/useGameState'
import { useLeaderboard } from '../hooks/useLeaderboard'

export default function DisplayPage() {
  const { gameState, loading } = useGameState()
  const entries = useLeaderboard(gameState?.currentRound ?? 0)

  if (loading || !gameState) return <p>불러오는 중...</p>

  return (
    <main>
      <h1>{gameState.currentRound === 11 ? '최종 순위' : `현재 라운드: ${gameState.currentRound}`}</h1>
      <ol>
        {entries.map((entry) => (
          <li key={entry.nickname}>
            {entry.nickname} — {entry.totalAssets.toLocaleString()}원
          </li>
        ))}
      </ol>
    </main>
  )
}
