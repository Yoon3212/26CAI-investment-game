export interface GameState {
  currentRound: number
  isPaused: boolean
}

export interface Stock {
  id: number
  name: string
  displayOrder: number
}

export interface StockPrice {
  stockId: number
  round: number
  price: number
}

export interface Participant {
  id: string
  nickname: string
  cash: number
}

export interface Holding {
  participantId: string
  stockId: number
  quantity: number
}

export interface LeaderboardEntry {
  nickname: string
  cash: number
  stockValue: number
  totalAssets: number
}
