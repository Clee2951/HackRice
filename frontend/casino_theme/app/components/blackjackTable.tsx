"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CardSlot } from "./card"
import { DealModal } from "./dealModal"
import {
  ApiError,
  DocumentSummary,
  listDocuments,
  logout,
  uploadDocument,
} from "@/lib/api"
import { kiosk } from "@/lib/kiosk"

/**
 *
 * Circle geometry, expressed in table-box percentages:
 *   center = (50%, 0%)  (midpoint of the flat top edge)
 *   radius = 100% of the box height
 * A seat at angle θ (measured downward from the right of center) sits at:
 *   x = 50 + R·cosθ ,  y = 0 + R·sinθ
 */
const SEAT_COUNT = 6
const ARC_START = 160 // degrees from the left edge
const ARC_END = 20 // degrees toward the right edge
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

export function BlackjackTable({ onLogout }: { onLogout?: () => void }) {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [dealFor, setDealFor] = useState<DocumentSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const seats = buildSeats(Math.max(SEAT_COUNT, documents.length))
  const tableMinWidth = 1100 + Math.max(0, documents.length - SEAT_COUNT) * 120

  const [exitPrompt, setExitPrompt] = useState<{
    open: boolean
    requiresPin: boolean
    pin: string
    error?: string
  } | null>(null)

  /** An expired or revoked token has to end the session rather than leave
   * the table showing stale cards it can no longer act on. */
  const handleFailure = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) {
        logout()
        onLogout?.()
        return
      }
      setError(cause instanceof ApiError ? cause.message : "Something went wrong.")
    },
    [onLogout],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const loaded = await listDocuments()
        if (cancelled) return
        setDocuments(loaded)
        setError("")
      } catch (cause) {
        if (!cancelled) handleFailure(cause)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [handleFailure])

  async function openExitPrompt() {
    const bridge = kiosk()
    if (!bridge) {
      setError("Exit is available when the app is running in Electron.")
      return
    }
    const config = await bridge.getConfig()
    setExitPrompt({ open: true, requiresPin: config.requiresPin, pin: "" })
  }

  async function confirmExit() {
    const bridge = kiosk()
    if (!bridge || !exitPrompt) return
    const result = await bridge.requestExit(exitPrompt.pin)
    if (!result.success) {
      // A successful call quits the app from the main process -- nothing
      // left to update here. Only a wrong PIN leaves the prompt open.
      setExitPrompt({ ...exitPrompt, error: result.message ?? "Incorrect PIN." })
    }
  }

  /** Upload, analyze, and deal a new card.
   *
   * One path for both environments: the Electron picker hands back the
   * bytes and the browser's file input hands back a File, and both end up
   * in the same authenticated POST /documents. The main process
   * deliberately doesn't upload on its own -- it has no bearer token, and
   * a second unauthenticated upload route would be a hole in the API. */
  const upload = useCallback(
    async (file: File) => {
      setUploading(true)
      setError("")
      try {
        const created = await uploadDocument(file)
        setDocuments((current) => [
          { id: created.id, title: created.title, status: created.status },
          ...current.filter((doc) => doc.id !== created.id),
        ])
      } catch (cause) {
        handleFailure(cause)
      } finally {
        setUploading(false)
      }
    },
    [handleFailure],
  )

  async function addFile() {
    const bridge = kiosk()
    if (!bridge) {
      // Plain browser: fall back to a hidden <input type="file">.
      fileInputRef.current?.click()
      return
    }
    const picked = await bridge.pickFile()
    if (picked.canceled || !picked.data || !picked.fileName) return
    await upload(new File([picked.data], picked.fileName))
  }

  return (
    <div className="relative flex min-h-svh w-full items-start justify-center overflow-hidden bg-radial from-green-900 from-50% to-neutral-900 to-100% bg-felt-dark p-4">
      {/* Kiosk exit -- fixed corner, always reachable regardless of table layout. */}
      <div className="fixed right-4 top-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => {
            logout()
            onLogout?.()
          }}
          className="rounded-full border border-gold/40 bg-black/40 px-4 py-2
          font-serif text-sm text-gold hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer"
        >
          LOG OUT
        </button>
        <button
          type="button"
          onClick={openExitPrompt}
          className="rounded-full border border-gold/40 bg-black/40 px-4 py-2
          font-serif text-sm text-gold hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer"
        >
          EXIT
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-red-400/50
          bg-red-950/90 px-5 py-2 text-sm text-red-100 shadow-lg"
        >
          {error}
        </p>
      )}

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

      {dealFor && (
        <DealModal
          document={dealFor}
          onClose={() => setDealFor(null)}
          onStarted={(sessionId) => router.push(`/reader?session=${sessionId}`)}
          onError={handleFailure}
        />
      )}

      {/* Browser fallback for the native picker. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Reset so picking the same file twice in a row still fires.
          event.target.value = ""
          if (file) void upload(file)
        }}
      />

      {/* Table box: width drives the semi-circle; height is half of width. */}
      <div className="relative aspect-[2/1] w-full max-w-[1100px] shrink-0" style={{ minWidth: `${tableMinWidth}px` }}>
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
            flex items-center justify-center font-serif hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer font-extrabold
            text-gold disabled:cursor-wait disabled:opacity-70"
            style={{ width: "34%", height: "12%" }}
            type="button"
            disabled={uploading}
            onClick={addFile}>
                {uploading ? "DEALING..." : "ADD FILE"}
            </button>

          {/* Table legend text */}
          <p
            className="absolute left-1/2 top-[30%] -translate-x-1/2 text-balance text-center font-serif text-gold"
            style={{ fontSize: "clamp(14px, 2.2vw, 30px)" }}
          >
            BLACKJACK
            <span className="mt-1 block text-[0.5em] tracking-[0.35em] text-felt-line">
              {uploading
                ? "THE HOUSE IS READING YOUR NOTES"
                : loading
                  ? "SHUFFLING..."
                  : documents.length === 0
                    ? "ADD A FILE TO BE DEALT IN"
                    : "PICK A CARD TO STUDY"}
            </span>
          </p>
        </div>

        {/* Card seats along the arc perimeter */}
        {seats.map((seat, index) => {
          const document = documents[index]

          return (
            <CardSlot
              key={seat.id}
              x={seat.x}
              y={seat.y}
              rotation={seat.rotation}
              label={document?.title ?? seat.label}
              documentName={document?.title}
              placeholder={!document}
              onSelect={document ? () => setDealFor(document) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
