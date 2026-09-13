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

const SEAT_COUNT = 6
const ARC_START = 160 
const ARC_END = 20 
const SEAT_RADIUS = 0.80 
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
    const rotation = angle - 90
    seats.push({ id: i + 1, x, y, rotation, label: `Seat ${i + 1}` })
  }
  return seats
}

export function BlackjackTable() {
  const router = useRouter()
  const [documents, setDocuments] = useState<SelectedDocument[]>([])
  const seats = buildSeats(Math.max(SEAT_COUNT, documents.length))
  const tableMinWidth = 1100 + Math.max(0, documents.length - SEAT_COUNT) * 120

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
      setExitPrompt({ ...exitPrompt, error: result.message ?? "Incorrect PIN." })
    }
  }

  // Handles uploading a file directly to Vultr Object Storage
  async function handleVultrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await fetch(
        `/api/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`
      );
      const data = await res.json();

      if (!data.uploadUrl) {
        throw new Error("Failed to generate Vultr upload URL");
      }

      const uploadRes = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Upload to Vultr failed");
      }

      setDocuments((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          name: file.name,
          path: `uploads/${file.name}`,
        },
      ]);
    } catch (err) {
      console.error("Vultr upload error:", err);
      alert("Error uploading file to Vultr.");
    }
  }

  return (
    <div className="relative flex min-h-svh w-full items-start justify-center overflow-hidden bg-radial from-green-900 from-50% to-neutral-900 to-100% bg-felt-dark p-4">
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

      <div className="relative aspect-[2/1] w-full max-w-[1100px] shrink-0" style={{ minWidth: `${tableMinWidth}px` }}>
        <div
          className="absolute inset-0 rounded-b-full bg-green-900 bg-gradient-to-b border-b-20 border-x-20 border-amber-900 from-rail-highlight to-rail shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]"
          style={{ transform: "scale(1.04)", transformOrigin: "top center" }}
          aria-hidden="true"
        />

        <div
          className="absolute inset-0 overflow-hidden rounded-b-full"
          style={{
            background:
              "radial-gradient(120% 150% at 50% 0%, var(--felt) 55%, var(--felt-dark) 100%)",
          }}
        >
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border-2 border-felt-line"
            style={{ width: "78%", height: "78%" }}
            aria-hidden="true"
          />
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border border-felt-line/60"
            style={{ width: "60%", height: "60%" }}
            aria-hidden="true"
          />

          {/* Dealer chip tray acting as the Vultr Upload Trigger */}
          <label
            className="absolute left-1/2 top-[6%] -translate-x-1/2 rounded-full border border-gold/40 bg-black/15
            flex items-center justify-center font-serif hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer font-extrabold text-gold"
            style={{ width: "34%", height: "12%" }}
          >
            <span>UPLOAD TO VULTR</span>
            <input 
              type="file" 
              className="hidden" 
              onChange={handleVultrUpload} 
            />
          </label>

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

        {seats.map((seat, index) => {
          const document = documents[index]

          return (
            <CardSlot
              key={seat.id}
              x={seat.x}
              y={seat.y}
              rotation={seat.rotation}
              label={document?.name ?? seat.label}
              documentName={document?.name}
              placeholder={!document}
              onSelect={document ? () => {
                const params = new URLSearchParams({
                  name: document.name,
                  path: document.path,
                })
                router.push(`/reader?${params.toString()}`)
              } : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}