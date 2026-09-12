"use client"

import { useMemo } from "react"

type CardSlotProps = {
  /** Horizontal position within the table, 0-100 (%) */
  x: number
  /** Vertical position within the table, 0-100 (%) */
  y: number
  /** Rotation in degrees so the card fans toward the table center */
  rotation: number
  /** Seat label shown until a real card/PDF is wired up */
  label: string
  /** Fired when the card is clicked — hook a PDF open handler here later */
  onSelect?: () => void
}

const CARD_VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
const CARD_COLORS = ["red", "black"] as const

function getRandomCardValue() {
  return CARD_VALUES[Math.floor(Math.random() * CARD_VALUES.length)]
}

function getRandomCardColor() {
  return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]
}

export function CardSlot({ x, y, rotation, label, onSelect }: CardSlotProps) {
  const cardValue = useMemo(() => getRandomCardValue(), [])
  const cardColor = useMemo(() => getRandomCardColor(), [])
  const colorClass = cardColor === "red" ? "text-red-600" : "text-zinc-900"

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Card for ${label}: ${cardValue}${cardValue}`}
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 outline-none"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span
        className="flex flex-col items-center justify-between rounded-lg border border-black/10 bg-gradient-to-b
        from-white to-zinc-200 text-zinc-700 shadow-[0_8px_18px_-6px_rgba(0,0,0,0.65)]
        transition-transform duration-200 ease-out group-hover:-translate-y-2
        group-hover:shadow-[0_16px_26px_-8px_rgba(0,0,0,0.7)] group-focus-visible:-translate-y-2
        group-focus-visible:ring-2 group-focus-visible:ring-gold cursor-pointer active:scale-95"
        style={{
          width: "clamp(48px, 6vw, 78px)",
          height: "clamp(68px, 8.4vw, 110px)",
          transform: `rotate(${rotation}deg)`,
          padding: "8px",
        }}
      >
        <span className={`self-start text-xs font-semibold leading-none opacity-90 ${colorClass}`}>{cardValue}</span>
        <span
          aria-hidden="true"
          className={`rounded-full border border-current px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${colorClass}`}
        >
          {cardValue}
        </span>
        <span className={`self-end rotate-180 text-xs font-semibold leading-none opacity-90 ${colorClass}`}>{cardValue}</span>
      </span>
    </button>
  )
}