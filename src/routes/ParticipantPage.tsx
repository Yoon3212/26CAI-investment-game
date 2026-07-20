import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import StockPriceChart from '../components/StockPriceChart'
import type { Stock, StockPrice } from '../lib/types'
import './ParticipantPage.css'

interface Me {
  id: string
  nickname: string
  cash: number
}

interface RoundInfo {
  round: number
  yearLabel: number
}

type View = { name: 'list' } | { name: 'chart'; stockId: number }

export default function ParticipantPage() {
  const { gameState, loading } = useGameState()
  const [nicknameInput, setNicknameInput] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [prices, setPrices] = useState<StockPrice[]>([])
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [holdings, setHoldings] = useState<Record<number, number>>({})
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    if (!gameState || gameState.currentRound < 1 || gameState.currentRound > 11) {
      // No active round (before start, or after end): never keep previously
      // revealed prices on screen — clear them and bail out of any chart
      // view, or a stale tab could leak future-round prices after a reset.
      setStocks([])
      setPrices([])
      setRounds([])
      setView({ name: 'list' })
      return
    }

    async function loadStocksAndPrices() {
      const [{ data: stockRows }, { data: priceRows }, { data: roundRows }] = await Promise.all([
        supabase.from('stocks').select('id, name, display_order').order('display_order'),
        supabase
          .from('stock_prices')
          .select('stock_id, round, price')
          .lte('round', gameState!.currentRound)
          .order('round'),
        supabase.from('rounds').select('round, year_label').lte('round', gameState!.currentRound).order('round'),
      ])
      setStocks((stockRows ?? []).map((s) => ({ id: s.id, name: s.name, displayOrder: s.display_order })))
      setPrices((priceRows ?? []).map((p) => ({ stockId: p.stock_id, round: p.round, price: p.price })))
      setRounds((roundRows ?? []).map((r) => ({ round: r.round, yearLabel: r.year_label })))
    }

    loadStocksAndPrices()
  }, [gameState?.currentRound])

  async function refreshHoldings(participantId: string) {
    const { data } = await supabase.from('holdings').select('stock_id, quantity').eq('participant_id', participantId)
    const map: Record<number, number> = {}
    for (const h of data ?? []) map[h.stock_id] = h.quantity
    setHoldings(map)
  }

  async function refreshMe(participantId: string) {
    const { data } = await supabase
      .from('participants')
      .select('id, nickname, cash')
      .eq('id', participantId)
      .single()
    if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
  }

  useEffect(() => {
    if (!me) return
    refreshHoldings(me.id)
    refreshMe(me.id)
  }, [me?.id, gameState?.currentRound])

  async function join() {
    setError(null)
    const { data, error } = await supabase.rpc('join_game', { p_nickname: nicknameInput }).single()
    if (error) {
      setError(error.message)
      return
    }
    setMe(data as Me)
  }

  async function buy(stockId: number) {
    if (!me) return
    const quantity = quantities[stockId] ?? 0
    if (quantity <= 0) return
    setError(null)
    const { error } = await supabase.rpc('buy_stock', {
      p_nickname: me.nickname,
      p_stock_id: stockId,
      p_quantity: quantity,
    })
    if (error) {
      setError(error.message)
      return
    }
    const { data } = await supabase.from('participants').select('id, nickname, cash').eq('id', me.id).single()
    if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
    await refreshHoldings(me.id)
  }

  function priceForRound(stockId: number, round: number): number | undefined {
    return prices.find((p) => p.stockId === stockId && p.round === round)?.price
  }

  function yearLabelForRound(round: number): number | undefined {
    return rounds.find((r) => r.round === round)?.yearLabel
  }

  if (loading || !gameState) return <p className="pp-loading">불러오는 중...</p>

  if (!me) {
    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-join">
          <p className="pp-kicker">모의 투자 레크리에이션</p>
          <h1>닉네임으로 입장하세요</h1>
          <p className="pp-sub">같은 닉네임으로 다시 들어오면 이전 기록 그대로 이어집니다.</p>
          <input value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="예: 1조" />
          <button onClick={join}>입장하기</button>
          {error && <p className="pp-error">{error}</p>}
        </div>
      </main>
    )
  }

  if (gameState.currentRound === 12) {
    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-ended">
          <p className="pp-kicker">게임 종료</p>
          <h1>10년간의 투자가 끝났습니다</h1>
          <p className="pp-final-amount">{me.cash.toLocaleString()}원</p>
          <p className="pp-final-label">{me.nickname}님의 최종 자산</p>
        </div>
      </main>
    )
  }

  if (view.name === 'chart') {
    const stock = stocks.find((s) => s.id === view.stockId)
    if (!stock) {
      return null
    }
    const currentPrice = priceForRound(stock.id, gameState.currentRound) ?? 0
    const prevPrice = priceForRound(stock.id, gameState.currentRound - 1)
    const delta = prevPrice !== undefined ? currentPrice - prevPrice : null
    const series = rounds.map((r) => ({
      round: r.round,
      yearLabel: r.yearLabel,
      price: priceForRound(stock.id, r.round) ?? 0,
    }))

    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-chart-top">
          <button className="pp-chart-back" onClick={() => setView({ name: 'list' })}>
            ← 종목 리스트로
          </button>
          <div className="pp-chart-name">{stock.name}</div>
          <div className="pp-chart-price">{currentPrice.toLocaleString()}원</div>
          {delta !== null && (
            <span className={delta >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()} (전 라운드 대비)
            </span>
          )}
        </div>
        <StockPriceChart series={series} />
        <div className="pp-chart-buy">
          <input
            type="number"
            min={1}
            value={quantities[stock.id] ?? ''}
            onChange={(e) => setQuantities((prev) => ({ ...prev, [stock.id]: Number(e.target.value) }))}
            disabled={gameState.isPaused}
          />
          <button onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
            이 가격에 매수
          </button>
        </div>
        {error && <p className="pp-error">{error}</p>}
      </main>
    )
  }

  return (
    <main className="pp-page">
      <BrandBar />
      <div className="pp-header">
        <div className="pp-row1">
          <span className="pp-nick">{me.nickname}</span>
          <span className="pp-round-badge">
            {yearLabelForRound(gameState.currentRound) ?? ''}년 · {gameState.currentRound}라운드
          </span>
        </div>
        <div className="pp-cash-label">보유 현금</div>
        <div className="pp-cash-amount">{me.cash.toLocaleString()}원</div>
      </div>

      {gameState.isPaused && <p className="pp-banner-closed">장이 마감되었습니다. 진행자의 재개를 기다려주세요.</p>}
      {error && <p className="pp-error">{error}</p>}

      <p className="pp-listlabel">종목 (탭하여 매수)</p>
      <ul className="pp-stocklist">
        {stocks.map((stock) => {
          const price = priceForRound(stock.id, gameState.currentRound) ?? 0
          const prevPrice = priceForRound(stock.id, gameState.currentRound - 1)
          const delta = prevPrice !== undefined ? price - prevPrice : null
          const expanded = expandedStockId === stock.id
          const holdingQty = holdings[stock.id]

          return (
            <li key={stock.id} className="pp-stock-row">
              <div className="pp-stock-row-main" onClick={() => setExpandedStockId(expanded ? null : stock.id)}>
                <span className="pp-avatar">{stock.displayOrder}</span>
                <div>
                  <div className="pp-stock-name">{stock.name}</div>
                  {holdingQty ? <div className="pp-stock-holding">보유 {holdingQty}주</div> : null}
                </div>
                <div className="pp-stock-pricecol">
                  <div className="pp-stock-price">{price.toLocaleString()}원</div>
                  {delta !== null && (
                    <span className={delta >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="pp-buyrow">
                  <input
                    type="number"
                    min={1}
                    value={quantities[stock.id] ?? ''}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [stock.id]: Number(e.target.value) }))}
                    disabled={gameState.isPaused}
                  />
                  <button className="pp-buy" onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
                    매수
                  </button>
                  <button className="pp-chartlink" onClick={() => setView({ name: 'chart', stockId: stock.id })}>
                    차트 보기 →
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
