"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { CardSlot } from "./card"

type SelectedDocument = {
  id: string
  name: string
  path: string
}

type KioskAPI = {
  pickFile: () => Promise<{
    canceled: boolean
    filePath?: string
    fileName?: string
  }>
  getConfig: () => Promise<{ requiresPin: boolean }>
  requestExit: (pin?: string) => Promise<{ success: boolean; message?: string }>
}

declare global {
  interface Window {
    kioskAPI?: KioskAPI
  }
}

/**
 *
 * Circle geometry, expressed in table-box percentages:
 *   center = (50%, 0%)  (midpoint of the flat top edge)
 *   radius = 100% of the box height
 * A seat at angle θ (measured downward from the right of center) sits at:
 *   x = 50 + R·cosθ ,  y = 0 + R·sinθ
 */
const SEAT_COUNT = 6
const ARC_START = 20 // degrees from the right edge
const ARC_END = 160 // degrees toward the left edge
const SEAT_RADIUS = 0.80 // fraction of the felt radius the cards sit at (0-1)
// The felt box is 2:1, so equal x/y percentages are not equal distances.
// Scale x by 50% of the width and y by 100% of the height to trace the ellipse.
const RX = 50
const RY = 100

function buildSeats(seatCount: number) {
  const seats = []
  for (let i = 0; i < seatCount; i++) {
    const t = seatCount === 1 ? 0.5 : i / (seatCount - 1)
    const angle = ARC_START + (ARC_END - ARC_START) * t
    const rad = (angle * Math.PI) / 180
    const x = 50 + SEAT_RADIUS * RX * Math.cos(rad)
    const y = SEAT_RADIUS * RY * Math.sin(rad)
    // Rotate the card so its top tilts toward the table center at (50, 0).
    const rotation = angle - 90
    seats.push({ id: i + 1, x, y, rotation, label: `Seat ${i + 1}` })
  }
  return seats
}

export function BlackjackTable() {
  const router = useRouter()
  const [documents, setDocuments] = useState<SelectedDocument[]>([])
  const seats = buildSeats(SEAT_COUNT + documents.length)

  const [exitPrompt, setExitPrompt] = useState<{
    open: boolean
    requiresPin: boolean
    pin: string
    error?: string
  } | null>(null)

  async function openExitPrompt() {
    if (!window.kioskAPI) {
      console.error("Exit is available when the app is running in Electron.")
      return
    }
    const config = await window.kioskAPI.getConfig()
    setExitPrompt({ open: true, requiresPin: config.requiresPin, pin: "" })
  }

  async function confirmExit() {
    if (!window.kioskAPI || !exitPrompt) return
    const result = await window.kioskAPI.requestExit(exitPrompt.pin)
    if (!result.success) {
      // A successful call quits the app from the main process -- nothing
      // left to update here. Only a wrong PIN leaves the prompt open.
      setExitPrompt({ ...exitPrompt, error: result.message ?? "Incorrect PIN." })
    }
  }

  async function addFile() {
    if (!window.kioskAPI) {
      console.error("File selection is available when the app is running in Electron.")
      return
    }

    const picked = await window.kioskAPI.pickFile()
    if (picked.canceled || !picked.filePath || !picked.fileName) return

    const filePath = picked.filePath
    const fileName = picked.fileName

    setDocuments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
      },
    ])
  }

  return (
    <div className="relative flex min-h-svh w-full items-start justify-center overflow-hidden bg-radial from-green-900 from-50% to-neutral-900 to-100% bg-felt-dark p-4">
      {/* Kiosk exit -- fixed corner, always reachable regardless of table layout. */}
      <button
        type="button"
        onClick={openExitPrompt}
        className="fixed right-4 top-4 z-50 rounded-full border border-gold/40 bg-black/40 px-4 py-2
        font-serif text-sm text-gold hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer"
      >
        EXIT
      </button>

      {exitPrompt?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm rounded-xl border border-gold/40 bg-neutral-900 p-6 font-serif text-gold shadow-2xl">
            <h2 className="mb-4 text-center text-xl">Exit kiosk mode?</h2>
            {exitPrompt.requiresPin && (
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={exitPrompt.pin}
                onChange={(e) => setExitPrompt({ ...exitPrompt, pin: e.target.value, error: undefined })}
                onKeyDown={(e) => e.key === "Enter" && confirmExit()}
                placeholder="Enter PIN"
                className="mb-3 w-full rounded-md border border-gold/40 bg-black/40 px-3 py-2 text-center text-white outline-none"
              />
            )}
            {exitPrompt.error && (
              <p className="mb-3 text-center text-sm text-red-400">{exitPrompt.error}</p>
            )}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setExitPrompt(null)}
                className="rounded-full border border-gold/40 px-4 py-2 text-sm hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="rounded-full border border-gold/40 bg-gold/20 px-4 py-2 text-sm hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table box: width drives the semi-circle; height is half of width. */}
      <div className="relative aspect-[2/1] w-full max-w-[1100px]">
        {/* Wooden rail (slightly larger semi-circle behind the felt) */}
        <div
          className="absolute inset-0 rounded-b-full bg-green-900 bg-gradient-to-b border-b-20 border-x-20 border-amber-900 from-rail-highlight to-rail shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]"
          style={{ transform: "scale(1.04)", transformOrigin: "top center" }}
          aria-hidden="true"
        />

        {/* Felt surface */}
        <div
          className="absolute inset-0 overflow-hidden rounded-b-full"
          style={{
            background:
              "radial-gradient(120% 150% at 50% 0%, var(--felt) 55%, var(--felt-dark) 100%)",
          }}
        >
          {/* Inner betting-line arc */}
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border-2 border-felt-line"
            style={{ width: "78%", height: "78%" }}
            aria-hidden="true"
          />
          {/* Payout arc */}
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border border-felt-line/60"
            style={{ width: "60%", height: "60%" }}
            aria-hidden="true"
          />

          {/* Dealer chip tray along the flat top edge */}
          <button
            className="absolute left-1/2 top-[6%] -translate-x-1/2 rounded-full border border-gold/40 bg-black/15
            flex items-center justify-center font-serif hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer font-extrabold"
            style={{ width: "34%", height: "12%" }}
            type="button"
            onClick={addFile}>
                ADD FILE
            </button>

          {/* Table legend text */}
          <p
            className="absolute left-1/2 top-[30%] -translate-x-1/2 text-balance text-center font-serif text-gold"
            style={{ fontSize: "clamp(14px, 2.2vw, 30px)" }}
          >
            BLACKJACK
            <span className="mt-1 block text-[0.5em] tracking-[0.35em] text-felt-line">
              PAYS 3 TO 2
            </span>
          </p>
        </div>

        {/* Card seats along the arc perimeter */}
        {seats.map((seat, index) => {
          const document = documents[index - SEAT_COUNT]

          return (
          <CardSlot
            key={seat.id}
            x={seat.x}
            y={seat.y}
            rotation={seat.rotation}
            label={document?.name ?? seat.label}
            documentName={document?.name}
            onSelect={() => {
              if (document) {
                const params = new URLSearchParams({
                  name: document.name,
                  path: document.path,
                })
                router.push(`/reader?${params.toString()}`)
              }
            }}
          />
          )
        })}
      </div>
    </div>
  )
}