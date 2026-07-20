import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { LeaderboardEntry } from '../lib/types'

export function useLeaderboard(currentRound: number) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    let active = true

    async function load() {
      const round = Math.min(Math.max(currentRound, 1), 11)

      const [{ data: participants }, { data: holdings }, { data: prices }] = await Promise.all([
        supabase.from('participants').select('id, nickname, cash'),
        supabase.from('holdings').select('participant_id, stock_id, quantity'),
        supabase.from('stock_prices').select('stock_id, price').eq('round', round),
      ])

      if (!active || !participants) return

      const priceByStock = new Map((prices ?? []).map((p) => [p.stock_id, p.price]))

      const result: LeaderboardEntry[] = participants.map((p) => {
        const stockValue = (holdings ?? [])
          .filter((h) => h.participant_id === p.id)
          .reduce((sum, h) => sum + h.quantity * (priceByStock.get(h.stock_id) ?? 0), 0)

        return {
          nickname: p.nickname,
          cash: p.cash,
          stockValue,
          totalAssets: p.cash + stockValue,
        }
      })

      result.sort((a, b) => b.totalAssets - a.totalAssets)
      setEntries(result)
    }

    load()

    const channel = supabase
      .channel('leaderboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, load)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [currentRound])

  return entries
}
