import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'

export default function HostPage() {
  const { gameState, loading } = useGameState()
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function callHostRpc(fn: string, extraArgs: Record<string, unknown> = {}) {
    setMessage(null)
    const { error } = await supabase.rpc(fn, { p_pin: pin, ...extraArgs })
    setMessage(error ? `오류: ${error.message}` : '완료')
  }

  if (loading || !gameState) return <p>불러오는 중...</p>

  return (
    <main>
      <h1>진행자 화면</h1>
      <p>
        현재 라운드: {gameState.currentRound} / 거래 상태: {gameState.isPaused ? '일시정지' : '진행중'}
      </p>

      <label>
        PIN: <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>

      <div>
        <button onClick={() => callHostRpc('host_start_game')} disabled={gameState.currentRound !== 0}>
          게임 시작
        </button>
        <button
          onClick={() => callHostRpc('host_next_year')}
          disabled={gameState.currentRound < 1 || gameState.currentRound >= 10}
        >
          다음 해
        </button>
        <button onClick={() => callHostRpc('host_end_game')} disabled={gameState.currentRound !== 10}>
          게임 종료
        </button>
        <button onClick={() => callHostRpc('host_toggle_pause', { p_paused: !gameState.isPaused })}>
          {gameState.isPaused ? '거래 재개' : '거래 일시정지'}
        </button>
        <button onClick={() => callHostRpc('host_reset_game')}>새 게임 시작</button>
      </div>

      {message && <p>{message}</p>}
    </main>
  )
}
