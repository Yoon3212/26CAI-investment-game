import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import Marquee from '../components/Marquee'
import StockPriceChart from '../components/StockPriceChart'
import QuantityStepper from '../components/QuantityStepper'
import Toast from '../components/Toast'
import type { Stock, StockPrice } from '../lib/types'
import { logoForStock } from '../lib/stockLogos'
import './ParticipantPage.css'

const SEED_MONEY = 1200000
const SESSION_KEY = 'cai-participant-id'

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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const chartStockId = searchParams.get('stock')
  const view: View = chartStockId ? { name: 'chart', stockId: Number(chartStockId) } : { name: 'list' }
  const { gameState, loading } = useGameState()
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [prices, setPrices] = useState<StockPrice[]>([])
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [holdings, setHoldings] = useState<Record<number, number>>({})
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null)
  const [lastRoundProfit, setLastRoundProfit] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [participantList, setParticipantList] = useState<{ id: string; nickname: string }[]>([])

  useEffect(() => {
    if (!me || !gameState || gameState.currentRound >= 1) {
      setParticipantList([])
      return
    }

    async function loadParticipants() {
      const { data } = await supabase.from('participants').select('id, nickname').order('created_at')
      setParticipantList(data ?? [])
    }

    loadParticipants()

    const channel = supabase
      .channel('participant_list_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadParticipants)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [me?.id, gameState?.currentRound])

  useEffect(() => {
    setQuantities({})

    if (!gameState || gameState.currentRound < 1 || gameState.currentRound > 11) {
      // No active round (before start, or after end): never keep previously
      // revealed prices on screen — clear them and bail out of any chart
      // view, or a stale tab could leak future-round prices after a reset.
      setStocks([])
      setPrices([])
      setRounds([])
      setSearchParams({}, { replace: true })
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

  useEffect(() => {
    if (gameState?.currentRound === 12) {
      // replace, not push: once the game has ended there is nothing to
      // "come back" to, so don't leave a trading-screen entry in history.
      navigate('/display', { replace: true })
    }
  }, [gameState?.currentRound, navigate])

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

  async function refreshLastRoundProfit(participantId: string) {
    const { data } = await supabase
      .from('asset_history')
      .select('round_profit')
      .eq('participant_id', participantId)
      .order('round', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLastRoundProfit(data ? data.round_profit : null)
  }

  useEffect(() => {
    if (!me) return
    refreshHoldings(me.id)
    refreshMe(me.id)
    refreshLastRoundProfit(me.id)
  }, [me?.id, gameState?.currentRound])

  useEffect(() => {
    // Restore the session on remount (e.g. navigating to /display and back)
    // so an in-app route change doesn't look like a logout. sessionStorage
    // (not localStorage) is intentional: a closed tab or a different
    // browser still has to re-enter the password, as originally designed.
    const savedId = sessionStorage.getItem(SESSION_KEY)
    if (!savedId) return
    supabase
      .from('participants')
      .select('id, nickname, cash')
      .eq('id', savedId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
        else sessionStorage.removeItem(SESSION_KEY)
      })
  }, [])

  async function join() {
    setError(null)
    const { data, error } = await supabase
      .rpc('join_game', { p_nickname: nicknameInput, p_password: passwordInput })
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setMe(data as Me)
    sessionStorage.setItem(SESSION_KEY, (data as Me).id)
  }

  async function buy(stockId: number) {
    if (!me || !gameState) return
    const quantity = quantities[stockId] ?? 1
    if (quantity <= 0) return
    setError(null)
    const price = priceForRound(stockId, gameState.currentRound) ?? 0
    const stockName = stocks.find((s) => s.id === stockId)?.name ?? '종목'
    const { error } = await supabase.rpc('buy_stock', {
      p_nickname: me.nickname,
      p_stock_id: stockId,
      p_quantity: quantity,
    })
    if (error) {
      setError(error.message)
      return
    }
    setToastMessage(`${stockName} ${quantity}주 매수 — 총 ${(price * quantity).toLocaleString()}원`)
    setQuantities((prev) => ({ ...prev, [stockId]: 1 }))
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

  function maxAffordable(price: number): number {
    if (!me || price <= 0) return 1
    return Math.max(1, Math.floor(me.cash / price))
  }

  if (loading || !gameState) return <p className="pp-loading">불러오는 중...</p>

  if (!me) {
    return (
      <main className="pp-page pp-page-center">
        <BrandBar />
        <div className="pp-join">
          <p className="pp-kicker">CAI 모의 투자 대회</p>
          <h1>팀명으로 입장하세요</h1>
          <p className="pp-sub">
            처음 입장이면 원하는 비밀번호를 새로 설정하세요. <br/> 이미 입장했었다면 그때 설정한 비밀번호를 입력하세요.
          </p>
          <div className="pp-join-card">
            <input value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="1조" />
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="비밀번호"
            />
            <button onClick={join}>입장하기</button>
          </div>
          {error && <p className="pp-error">{error}</p>}
        </div>
        <p className="pp-credit">제작 윤석현</p>
      </main>
    )
  }

  if (gameState.currentRound < 1) {
    const otherParticipants = participantList.filter((p) => p.id !== me.id)
    return (
      <main className="pp-page pp-page-center">
        <BrandBar />
        <div className="pp-join">
          <p className="pp-kicker">CAI 모의 투자 대회</p>
          <h1>&quot;{me.nickname}&quot;님</h1>
          <p className="pp-sub">
            입장이 완료되었습니다. <br /> 진행자의 시작을 기다려주세요.
          </p>
          {otherParticipants.length > 0 && (
            <div className="pp-waiting-list">
              <p className="pp-listlabel">참가자 목록 ({participantList.length}명)</p>
              <ul className="pp-waiting-participants">
                {otherParticipants.map((p) => (
                  <li key={p.id}>{p.nickname}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (gameState.currentRound === 12) {
    return <p className="pp-loading">게임 결과로 이동 중...</p>
  }

  const currentHoldingsValue = Object.entries(holdings).reduce((sum, [stockIdStr, qty]) => {
    const price = priceForRound(Number(stockIdStr), gameState.currentRound) ?? 0
    return sum + qty * price
  }, 0)
  const totalAssets = me.cash + currentHoldingsValue
  const returnRate = ((totalAssets - SEED_MONEY) / SEED_MONEY) * 100
  const heldStocks = stocks.filter((s) => holdings[s.id])

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
    const holdingQty = holdings[stock.id]
    const quantity = quantities[stock.id] ?? 1

    return (
      <main className="pp-page">
        <BrandBar />
        <Marquee text="장중 매도는 불가능하니 신중하게 매수하세요, 라운드가 종료되면 자동으로 매도됩니다." />
        <div className="pp-chart-top">
          <button className="pp-chart-back" onClick={() => navigate(-1)}>
            ← 종목 리스트로
          </button>
          <div className="pp-chart-header">
            {logoForStock(stock.name) && (
              <img
                className="pp-chart-logo"
                src={logoForStock(stock.name)}
                alt=""
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
            <div>
              <div className="pp-chart-name">{stock.name}</div>
              {holdingQty ? <div className="pp-stock-holding">보유 {holdingQty}주</div> : null}
              <div className="pp-chart-price">{currentPrice.toLocaleString()}원</div>
              {delta !== null && (
                <span className={delta >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()} (전 라운드 대비)
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="pp-chart-block">
          <StockPriceChart series={series} />
        </div>
        <div className="pp-chart-buy">
          <QuantityStepper
            value={quantity}
            onChange={(next) => setQuantities((prev) => ({ ...prev, [stock.id]: next }))}
            disabled={gameState.isPaused}
            max={maxAffordable(currentPrice)}
          />
          <span className="pp-buy-total">{(currentPrice * quantity).toLocaleString()}원</span>
          <button onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
            매수
          </button>
        </div>
        {error && <p className="pp-error">{error}</p>}
        {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
      </main>
    )
  }

  return (
    <main className="pp-page">
      <BrandBar />
      <Marquee text="장중 매도는 불가능하니 신중하게 매수하세요, 라운드가 종료되면 자동으로 매도됩니다." />
      <div className="pp-header">
        <div className="pp-row1">
          <span className="pp-nick">{me.nickname}</span>
          <div className="pp-row1-right">
            <button className="pp-rank-btn" onClick={() => navigate('/display')}>
              순위 보기
            </button>
            <span className="pp-round-badge">
              {yearLabelForRound(gameState.currentRound) ?? ''}년 · {gameState.currentRound}라운드
            </span>
          </div>
        </div>
        <div className="pp-cash-label">시드머니</div>
        <div className="pp-cash-amount">{me.cash.toLocaleString()}원</div>
        <div className="pp-returns-row">
          <span className={returnRate >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
            처음 대비 {returnRate >= 0 ? '+' : ''}
            {returnRate.toFixed(1)}%
          </span>
          {lastRoundProfit !== null && (
            <span className={lastRoundProfit >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
              직전 거래 {lastRoundProfit >= 0 ? '+' : ''}
              {lastRoundProfit.toLocaleString()}원
            </span>
          )}
        </div>
      </div>

      {gameState.isPaused && <p className="pp-banner-closed">장이 마감되었습니다.</p>}
      {error && <p className="pp-error">{error}</p>}

      {heldStocks.length > 0 && (
        <div className="pp-holdings-block">
          <p className="pp-listlabel">보유 주식</p>
          <ul className="pp-holdings-list">
            {heldStocks.map((stock) => {
              const qty = holdings[stock.id]
              const price = priceForRound(stock.id, gameState.currentRound) ?? 0
              return (
                <li key={stock.id} className="pp-holdings-row">
                  <span className="pp-holdings-name">{stock.name}</span>
                  <span className="pp-holdings-qty">{qty}주</span>
                  <span className="pp-holdings-value">{(qty * price).toLocaleString()}원</span>
                </li>
              )
            })}
            <li className="pp-holdings-row pp-holdings-total">
              <span className="pp-holdings-name">총 매수 금액</span>
              <span className="pp-holdings-value">{currentHoldingsValue.toLocaleString()}원</span>
            </li>
          </ul>
        </div>
      )}

      <div className="pp-card">
        <p className="pp-listlabel">종목</p>
        <ul className="pp-stocklist">
        {stocks.map((stock) => {
          const price = priceForRound(stock.id, gameState.currentRound) ?? 0
          const prevPrice = priceForRound(stock.id, gameState.currentRound - 1)
          const delta = prevPrice !== undefined ? price - prevPrice : null
          const expanded = expandedStockId === stock.id
          const holdingQty = holdings[stock.id]
          const quantity = quantities[stock.id] ?? 1

          return (
            <li key={stock.id} className="pp-stock-row">
              <div className="pp-stock-row-main" onClick={() => setExpandedStockId(expanded ? null : stock.id)}>
                {logoForStock(stock.name) ? (
                  <img
                    className="pp-avatar-img"
                    src={logoForStock(stock.name)}
                    alt=""
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : (
                  <span className="pp-avatar">{stock.displayOrder}</span>
                )}
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
                  <QuantityStepper
                    value={quantity}
                    onChange={(next) => setQuantities((prev) => ({ ...prev, [stock.id]: next }))}
                    disabled={gameState.isPaused}
                    max={maxAffordable(price)}
                  />
                  <span className="pp-buy-total">{(price * quantity).toLocaleString()}원</span>
                  <button className="pp-buy" onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
                    매수
                  </button>
                  <button
                    className="pp-chartbtn"
                    onClick={() => setSearchParams({ stock: String(stock.id) })}
                  >
                    차트 보기 →
                  </button>
                </div>
              )}
            </li>
          )
        })}
        </ul>
      </div>

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </main>
  )
}
