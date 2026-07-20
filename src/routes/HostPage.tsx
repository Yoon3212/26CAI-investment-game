import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import './HostPage.css'

const ROUND_LABELS: Record<number, string> = {
  0: '대기 중 (게임 시작 전)',
  12: '게임 종료',
}

export default function HostPage() {
  const { gameState, loading } = useGameState()
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function callHostRpc(confirmMessage: string, fn: string, extraArgs: Record<string, unknown> = {}) {
    if (!window.confirm(confirmMessage)) return
    setMessage(null)
    const { error } = await supabase.rpc(fn, { p_pin: pin, ...extraArgs })
    setMessage(error ? { text: error.message, ok: false } : { text: '완료', ok: true })
  }

  if (loading || !gameState) return <p className="host-loading">불러오는 중...</p>

  const roundLabel = ROUND_LABELS[gameState.currentRound] ?? `${gameState.currentRound}라운드 진행 중`

  return (
    <main className="host-page">
      <BrandBar />
      <div className="host-body">
        <section className="host-status">
          <div className="host-status-round">{roundLabel}</div>
          <div className={gameState.isPaused ? 'host-pill host-pill-closed' : 'host-pill host-pill-open'}>
            {gameState.isPaused ? '● 거래 일시정지' : '● 거래 진행중'}
          </div>
        </section>

        <label className="host-pin-label">
          진행자 PIN
          <input
            className="host-pin-input"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN 입력"
          />
        </label>

        <section>
          <div className="host-actions-label">라운드 진행</div>
          <div className="host-actions-row">
            <button
              className="host-btn host-btn-primary"
              onClick={() => callHostRpc('게임을 시작할까요? (1라운드부터 거래가 열립니다)', 'host_start_game')}
              disabled={gameState.currentRound !== 0}
            >
              게임 시작
            </button>
            <button
              className="host-btn host-btn-primary"
              onClick={() =>
                callHostRpc(
                  '다음 해로 넘어갈까요? 보유 주식이 새 가격에 자동 매도됩니다.',
                  'host_next_year',
                )
              }
              disabled={gameState.currentRound < 1 || gameState.currentRound >= 11}
            >
              다음 해
            </button>
            <button
              className="host-btn host-btn-primary"
              onClick={() =>
                callHostRpc('게임을 종료할까요? 남은 보유 주식이 최종 청산됩니다.', 'host_end_game')
              }
              disabled={gameState.currentRound !== 11}
            >
              게임 종료
            </button>
          </div>

          <div className="host-actions-label">거래 제어</div>
          <div className="host-actions-row">
            <button
              className="host-btn host-btn-secondary"
              onClick={() =>
                callHostRpc(
                  gameState.isPaused ? '거래를 재개할까요?' : '거래를 일시정지할까요?',
                  'host_toggle_pause',
                  { p_paused: !gameState.isPaused },
                )
              }
            >
              {gameState.isPaused ? '거래 재개' : '거래 일시정지'}
            </button>
          </div>
        </section>

        <section className="host-danger">
          <div className="host-danger-label">위험 구역</div>
          <button
            className="host-btn host-btn-danger"
            onClick={() =>
              callHostRpc(
                '정말 새 게임을 시작할까요? 모든 참가자와 기록이 완전히 삭제됩니다. 되돌릴 수 없습니다.',
                'host_reset_game',
              )
            }
          >
            새 게임 시작 (전체 초기화)
          </button>
        </section>

        {message && (
          <p className={message.ok ? 'host-message host-message-ok' : 'host-message host-message-error'}>
            {message.text}
          </p>
        )}
      </div>
    </main>
  )
}
