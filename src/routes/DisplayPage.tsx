import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import { useLeaderboard } from '../hooks/useLeaderboard'
import BrandBar from '../components/BrandBar'
import AssetHistoryChart from '../components/AssetHistoryChart'
import type { AssetHistoryEntry } from '../lib/types'
import './DisplayPage.css'

const MEDALS = ['🥇', '🥈', '🥉']
const SERIES_COLORS = ['#3b82f6', '#a855f7', '#0d9488', '#ea580c', '#db2777', '#64748b', '#4338ca', '#84702c']

export default function DisplayPage() {
  const navigate = useNavigate()
  const { gameState, loading } = useGameState()
  const entries = useLeaderboard(gameState?.currentRound ?? 0)
  const [rounds, setRounds] = useState<{ round: number; yearLabel: number }[]>([])
  const [history, setHistory] = useState<AssetHistoryEntry[]>([])

  useEffect(() => {
    document.title = '순위 | CAI LT 투자 대회'
  }, [])

  useEffect(() => {
    supabase
      .from('rounds')
      .select('round, year_label')
      .order('round')
      .then(({ data }) => setRounds((data ?? []).map((r) => ({ round: r.round, yearLabel: r.year_label }))))
  }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('asset_history')
        .select('round, year_label, participant_id, nickname, total_assets, round_profit')
        .order('round')
      setHistory(
        (data ?? []).map((d) => ({
          round: d.round,
          yearLabel: d.year_label,
          participantId: d.participant_id,
          nickname: d.nickname,
          totalAssets: d.total_assets,
          roundProfit: d.round_profit,
        })),
      )
    }
    load()
  }, [gameState?.currentRound])

  useEffect(() => {
    // Once the game has ended there is nothing to go back to (trading is
    // over) — trap the back button/gesture on this screen instead of
    // letting it return to a stale, no-longer-playable trading screen.
    if (gameState?.currentRound !== 12) return
    window.history.pushState(null, '', window.location.href)
    function blockBack() {
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', blockBack)
    return () => window.removeEventListener('popstate', blockBack)
  }, [gameState?.currentRound])

  const series = useMemo(() => {
    const byNickname = new Map<string, { round: number; yearLabel: number; totalAssets: number }[]>()
    for (const h of history) {
      if (!byNickname.has(h.nickname)) byNickname.set(h.nickname, [])
      byNickname.get(h.nickname)!.push({ round: h.round, yearLabel: h.yearLabel, totalAssets: h.totalAssets })
    }
    return Array.from(byNickname.entries()).map(([nickname, points], i) => ({
      nickname,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: [...points].sort((a, b) => a.round - b.round),
    }))
  }, [history])

  if (loading || !gameState) return <p className="disp-loading">불러오는 중...</p>

  const isEnded = gameState.currentRound === 12
  const yearLabel = rounds.find((r) => r.round === (isEnded ? 11 : gameState.currentRound))?.yearLabel

  return (
    <main className="disp-page">
      <BrandBar />
      <div className="disp-body">
        {!isEnded && (
          <button className="disp-back" onClick={() => navigate(-1)}>
            ← 돌아가기
          </button>
        )}
        <div className="disp-heading">
          <div className="disp-kicker">{isEnded ? '게임 종료' : '진행 중'}</div>
          <h1 className="disp-title">
            {isEnded ? '최종 순위' : `${yearLabel ?? ''}년 · ${gameState.currentRound}라운드`}
          </h1>
        </div>

        <div className="disp-chart-block">
          <div className="disp-chart-label">팀별 누적 자산 추이</div>
          <AssetHistoryChart series={series} />
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
