import type { TradeData } from "@portfolio-chart/types/trade-data"

export const mockTradeData: Array<TradeData> = [
  {
    id: "1",
    date: "2023-01-05",
    symbol: "AAPL",
    value: 2.4,
    logic:
      "Entered long position after positive earnings report and technical breakout above resistance.",
    evaluation:
      "Good entry timing, but could have taken partial profits at the first sign of resistance.",
    nextStrategy:
      "Set tighter trailing stop to protect gains in volatile market conditions.",
  },
  {
    id: "2",
    date: "2023-01-12",
    symbol: "MSFT",
    value: -1.8,
    logic:
      "Entered short position based on overbought RSI and negative divergence on MACD.",
    evaluation:
      "Failed to account for overall market sentiment which remained bullish.",
    nextStrategy:
      "Wait for confirmation of trend reversal before entering counter-trend positions.",
  },
  {
    id: "3",
    date: "2023-01-19",
    symbol: "AMZN",
    value: -3.5,
    logic: "Entered long position on support bounce with increasing volume.",
    evaluation:
      "Support level failed due to unexpected negative news. Position sizing was too large.",
    nextStrategy:
      "Reduce position size for high-volatility stocks and implement news-based stop rules.",
  },
  {
    id: "4",
    date: "2023-01-26",
    symbol: "TSLA",
    value: 1.2,
    logic:
      "Entered short position after double top formation and bearish engulfing candle.",
    evaluation:
      "Good technical analysis, but closed position too early missing additional downside.",
    nextStrategy:
      "Use partial position closing to lock in profits while letting winners run.",
  },
  {
    id: "5",
    date: "2023-02-02",
    symbol: "NVDA",
    value: 4.7,
    logic:
      "Entered long position after sector rotation into semiconductors and bullish flag pattern.",
    evaluation:
      "Strong execution with proper position sizing and well-defined exit strategy.",
    nextStrategy:
      "Continue with similar approach but monitor sector correlation more closely.",
  },
  {
    id: "6",
    date: "2023-02-09",
    symbol: "META",
    value: -2.1,
    logic:
      "Entered long position after significant pullback, expecting mean reversion.",
    evaluation:
      "Failed to recognize the strength of the downtrend and underlying fundamental issues.",
    nextStrategy:
      "Avoid catching falling knives; wait for trend reversal confirmation.",
  },
  {
    id: "7",
    date: "2023-02-16",
    symbol: "GOOG",
    value: 3.2,
    logic:
      "Entered long position based on positive divergence in RSI and support at 200-day moving average.",
    evaluation: "Excellent technical entry with proper risk management.",
    nextStrategy:
      "Look for similar setups in related stocks within the same sector.",
  },
  {
    id: "8",
    date: "2023-02-23",
    symbol: "AMD",
    value: 5.8,
    logic:
      "Entered long position after breakout from consolidation pattern with increasing volume.",
    evaluation: "Perfect execution with ideal entry point and position sizing.",
    nextStrategy:
      "Consider scaling into similar positions to reduce timing risk.",
  },
  {
    id: "9",
    date: "2023-03-02",
    symbol: "INTC",
    value: -1.5,
    logic:
      "Entered short position based on head and shoulders pattern and breakdown below support.",
    evaluation:
      "Pattern failed as market sentiment shifted. Stop loss was properly placed.",
    nextStrategy:
      "Wait for confirmation of pattern completion before entering position.",
  },
  {
    id: "10",
    date: "2023-03-09",
    symbol: "ADBE",
    value: 2.9,
    logic:
      "Entered long position after gap fill and bounce from support with positive volume profile.",
    evaluation:
      "Good technical analysis and timing. Could have added to position on confirmation.",
    nextStrategy: "Consider scaling in on confirmation of trend direction.",
  },
]
