import { useGameState } from '../hooks/useGameState'
import { useLeaderboard } from '../hooks/useLeaderboard'
import BrandBar from '../components/BrandBar'
import './DisplayPage.css'

const MEDALS = ['🥇', '🥈', '🥉']

export default function DisplayPage() {
  const { gameState, loading } = useGameState()
  const entries = useLeaderboard(gameState?.currentRound ?? 0)

  if (loading || !gameState) return <p className="disp-loading">불러오는 중...</p>

  const isEnded = gameState.currentRound === 11

  return (
    <main className="disp-page">
      <BrandBar />
      <div className="disp-body">
        <div className="disp-heading">
          <div className="disp-kicker">{isEnded ? '게임 종료' : '진행 중'}</div>
          <h1 className="disp-title">{isEnded ? '최종 순위' : `${gameState.currentRound}라운드`}</h1>
        </div>

        <ol className="disp-rank-list">
          {entries.map((entry, i) => (
            <li key={entry.nickname} className={i === 0 ? 'disp-rank-row disp-rank-first' : 'disp-rank-row'}>
              <span className="disp-rank-medal">{MEDALS[i] ?? i + 1}</span>
              <span className="disp-rank-name">{entry.nickname}</span>
              <span className="disp-rank-amount">{entry.totalAssets.toLocaleString()}원</span>
            </li>
          ))}
          {entries.length === 0 && <li className="disp-rank-empty">아직 참가자가 없습니다</li>}
        </ol>
      </div>
    </main>
  )
}
