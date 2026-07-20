import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { GameState } from '../lib/types'

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase
        .from('game_state')
        .select('current_round, is_paused')
        .eq('id', 1)
        .single()

      if (!active) return
      if (error) {
        console.error(error)
        setLoading(false)
        return
      }
      setGameState({ currentRound: data.current_round, isPaused: data.is_paused })
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('game_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => {
          const row = payload.new as { current_round: number; is_paused: boolean }
          setGameState({ currentRound: row.current_round, isPaused: row.is_paused })
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { gameState, loading }
}
