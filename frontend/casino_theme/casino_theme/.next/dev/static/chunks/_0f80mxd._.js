(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/components/blackjackTable.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BlackjackTable",
    ()=>BlackjackTable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$dealModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/dealModal.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kiosk$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kiosk.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
/**
 *
 * Circle geometry, expressed in table-box percentages:
 *   center = (50%, 0%)  (midpoint of the flat top edge)
 *   radius = 100% of the box height
 * A seat at angle θ (measured downward from the right of center) sits at:
 *   x = 50 + R·cosθ ,  y = 0 + R·sinθ
 */ const SEAT_COUNT = 6;
const ARC_START = 160 // degrees from the left edge
;
const ARC_END = 20 // degrees toward the right edge
;
const SEAT_RADIUS = 0.80 // fraction of the felt radius the cards sit at (0-1)
;
// The felt box is 2:1, so equal x/y percentages are not equal distances.
// Scale x by 50% of the width and y by 100% of the height to trace the ellipse.
const RX = 50;
const RY = 100;
function buildSeats(seatCount) {
    const seats = [];
    for(let i = 0; i < seatCount; i++){
        const t = seatCount === 1 ? 0.5 : i / (seatCount - 1);
        const angle = ARC_START + (ARC_END - ARC_START) * t;
        const rad = angle * Math.PI / 180;
        const x = 50 + SEAT_RADIUS * RX * Math.cos(rad);
        const y = SEAT_RADIUS * RY * Math.sin(rad);
        // Rotate the card so its top tilts toward the table center at (50, 0).
        const rotation = angle - 90;
        seats.push({
            id: i + 1,
            x,
            y,
            rotation,
            label: `Seat ${i + 1}`
        });
    }
    return seats;
}
function BlackjackTable({ onLogout }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [documents, setDocuments] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [uploading, setUploading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [dealFor, setDealFor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const fileInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const seats = buildSeats(Math.max(SEAT_COUNT, documents.length));
    const tableMinWidth = 1100 + Math.max(0, documents.length - SEAT_COUNT) * 120;
    const [exitPrompt, setExitPrompt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    /** An expired or revoked token has to end the session rather than leave
   * the table showing stale cards it can no longer act on. */ const handleFailure = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "BlackjackTable.useCallback[handleFailure]": (cause)=>{
            if (cause instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && cause.status === 401) {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["logout"])();
                onLogout?.();
                return;
            }
            setError(cause instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] ? cause.message : "Something went wrong.");
        }
    }["BlackjackTable.useCallback[handleFailure]"], [
        onLogout
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "BlackjackTable.useEffect": ()=>{
            let cancelled = false;
            async function load() {
                try {
                    const loaded = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listDocuments"])();
                    if (cancelled) return;
                    setDocuments(loaded);
                    setError("");
                } catch (cause) {
                    if (!cancelled) handleFailure(cause);
                } finally{
                    if (!cancelled) setLoading(false);
                }
            }
            void load();
            return ({
                "BlackjackTable.useEffect": ()=>{
                    cancelled = true;
                }
            })["BlackjackTable.useEffect"];
        }
    }["BlackjackTable.useEffect"], [
        handleFailure
    ]);
    async function openExitPrompt() {
        const bridge = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kiosk$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["kiosk"])();
        if (!bridge) {
            setError("Exit is available when the app is running in Electron.");
            return;
        }
        const config = await bridge.getConfig();
        setExitPrompt({
            open: true,
            requiresPin: config.requiresPin,
            pin: ""
        });
    }
    async function confirmExit() {
        const bridge = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kiosk$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["kiosk"])();
        if (!bridge || !exitPrompt) return;
        const result = await bridge.requestExit(exitPrompt.pin);
        if (!result.success) {
            // A successful call quits the app from the main process -- nothing
            // left to update here. Only a wrong PIN leaves the prompt open.
            setExitPrompt({
                ...exitPrompt,
                error: result.message ?? "Incorrect PIN."
            });
        }
    }
    /** Upload, analyze, and deal a new card.
   *
   * One path for both environments: the Electron picker hands back the
   * bytes and the browser's file input hands back a File, and both end up
   * in the same authenticated POST /documents. The main process
   * deliberately doesn't upload on its own -- it has no bearer token, and
   * a second unauthenticated upload route would be a hole in the API. */ const upload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "BlackjackTable.useCallback[upload]": async (file)=>{
            setUploading(true);
            setError("");
            try {
                const created = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["uploadDocument"])(file);
                setDocuments({
                    "BlackjackTable.useCallback[upload]": (current)=>[
                            {
                                id: created.id,
                                title: created.title,
                                status: created.status
                            },
                            ...current.filter({
                                "BlackjackTable.useCallback[upload]": (doc)=>doc.id !== created.id
                            }["BlackjackTable.useCallback[upload]"])
                        ]
                }["BlackjackTable.useCallback[upload]"]);
            } catch (cause) {
                handleFailure(cause);
            } finally{
                setUploading(false);
            }
        }
    }["BlackjackTable.useCallback[upload]"], [
        handleFailure
    ]);
    async function addFile() {
        const bridge = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kiosk$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["kiosk"])();
        if (!bridge) {
            // Plain browser: fall back to a hidden <input type="file">.
            fileInputRef.current?.click();
            return;
        }
        const picked = await bridge.pickFile();
        if (picked.canceled || !picked.data || !picked.fileName) return;
        await upload(new File([
            picked.data
        ], picked.fileName));
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative flex min-h-svh w-full items-start justify-center overflow-hidden bg-radial from-green-900 from-50% to-neutral-900 to-100% bg-felt-dark p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed right-4 top-4 z-50 flex gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["logout"])();
                            onLogout?.();
                        },
                        className: "rounded-full border border-gold/40 bg-black/40 px-4 py-2\r\n\n          font-serif text-sm text-gold hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer",
                        children: "LOG OUT"
                    }, void 0, false, {
                        fileName: "[project]/app/components/blackjackTable.tsx",
                        lineNumber: 164,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: openExitPrompt,
                        className: "rounded-full border border-gold/40 bg-black/40 px-4 py-2\r\n\n          font-serif text-sm text-gold hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer",
                        children: "EXIT"
                    }, void 0, false, {
                        fileName: "[project]/app/components/blackjackTable.tsx",
                        lineNumber: 175,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 163,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                role: "alert",
                className: "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-red-400/50\r\n\n          bg-red-950/90 px-5 py-2 text-sm text-red-100 shadow-lg",
                children: error
            }, void 0, false, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 186,
                columnNumber: 9
            }, this),
            exitPrompt?.open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full max-w-sm rounded-xl border border-gold/40 bg-neutral-900 p-6 font-serif text-gold shadow-2xl",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "mb-4 text-center text-xl",
                            children: "Exit kiosk mode?"
                        }, void 0, false, {
                            fileName: "[project]/app/components/blackjackTable.tsx",
                            lineNumber: 198,
                            columnNumber: 13
                        }, this),
                        exitPrompt.requiresPin && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            type: "password",
                            inputMode: "numeric",
                            autoFocus: true,
                            value: exitPrompt.pin,
                            onChange: (e)=>setExitPrompt({
                                    ...exitPrompt,
                                    pin: e.target.value,
                                    error: undefined
                                }),
                            onKeyDown: (e)=>e.key === "Enter" && confirmExit(),
                            placeholder: "Enter PIN",
                            className: "mb-3 w-full rounded-md border border-gold/40 bg-black/40 px-3 py-2 text-center text-white outline-none"
                        }, void 0, false, {
                            fileName: "[project]/app/components/blackjackTable.tsx",
                            lineNumber: 200,
                            columnNumber: 15
                        }, this),
                        exitPrompt.error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mb-3 text-center text-sm text-red-400",
                            children: exitPrompt.error
                        }, void 0, false, {
                            fileName: "[project]/app/components/blackjackTable.tsx",
                            lineNumber: 212,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex justify-center gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setExitPrompt(null),
                                    className: "rounded-full border border-gold/40 px-4 py-2 text-sm hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer",
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/blackjackTable.tsx",
                                    lineNumber: 215,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: confirmExit,
                                    className: "rounded-full border border-gold/40 bg-gold/20 px-4 py-2 text-sm hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer",
                                    children: "Exit"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/blackjackTable.tsx",
                                    lineNumber: 222,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/blackjackTable.tsx",
                            lineNumber: 214,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/components/blackjackTable.tsx",
                    lineNumber: 197,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 196,
                columnNumber: 9
            }, this),
            dealFor && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$dealModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DealModal"], {
                document: dealFor,
                onClose: ()=>setDealFor(null),
                onStarted: (sessionId)=>router.push(`/reader?session=${sessionId}`),
                onError: handleFailure
            }, void 0, false, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 235,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                ref: fileInputRef,
                type: "file",
                accept: ".pdf,.txt,.md,.docx",
                className: "hidden",
                onChange: (event)=>{
                    const file = event.target.files?.[0];
                    // Reset so picking the same file twice in a row still fires.
                    event.target.value = "";
                    if (file) void upload(file);
                }
            }, void 0, false, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 244,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative aspect-[2/1] w-full max-w-[1100px] shrink-0",
                style: {
                    minWidth: `${tableMinWidth}px`
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-0 rounded-b-full bg-green-900 bg-gradient-to-b border-b-20 border-x-20 border-amber-900 from-rail-highlight to-rail shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]",
                        style: {
                            transform: "scale(1.04)",
                            transformOrigin: "top center"
                        },
                        "aria-hidden": "true"
                    }, void 0, false, {
                        fileName: "[project]/app/components/blackjackTable.tsx",
                        lineNumber: 260,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-0 overflow-hidden rounded-b-full",
                        style: {
                            background: "radial-gradient(120% 150% at 50% 0%, var(--felt) 55%, var(--felt-dark) 100%)"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border-2 border-felt-line",
                                style: {
                                    width: "78%",
                                    height: "78%"
                                },
                                "aria-hidden": "true"
                            }, void 0, false, {
                                fileName: "[project]/app/components/blackjackTable.tsx",
                                lineNumber: 275,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full border border-felt-line/60",
                                style: {
                                    width: "60%",
                                    height: "60%"
                                },
                                "aria-hidden": "true"
                            }, void 0, false, {
                                fileName: "[project]/app/components/blackjackTable.tsx",
                                lineNumber: 281,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "absolute left-1/2 top-[6%] -translate-x-1/2 rounded-full border border-gold/40 bg-black/15\r\n\n            flex items-center justify-center font-serif hover:scale-105 active:scale-95 duration-300 ease-in-out cursor-pointer font-extrabold\r\n\n            text-gold disabled:cursor-wait disabled:opacity-70",
                                style: {
                                    width: "34%",
                                    height: "12%"
                                },
                                type: "button",
                                disabled: uploading,
                                onClick: addFile,
                                children: uploading ? "DEALING..." : "ADD FILE"
                            }, void 0, false, {
                                fileName: "[project]/app/components/blackjackTable.tsx",
                                lineNumber: 288,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "absolute left-1/2 top-[30%] -translate-x-1/2 text-balance text-center font-serif text-gold",
                                style: {
                                    fontSize: "clamp(14px, 2.2vw, 30px)"
                                },
                                children: [
                                    "BLACKJACK",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "mt-1 block text-[0.5em] tracking-[0.35em] text-felt-line",
                                        children: uploading ? "THE HOUSE IS READING YOUR NOTES" : loading ? "SHUFFLING..." : documents.length === 0 ? "ADD A FILE TO BE DEALT IN" : "PICK A CARD TO STUDY"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/blackjackTable.tsx",
                                        lineNumber: 305,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/blackjackTable.tsx",
                                lineNumber: 300,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/blackjackTable.tsx",
                        lineNumber: 267,
                        columnNumber: 9
                    }, this),
                    seats.map((seat, index)=>{
                        const document = documents[index];
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardSlot"], {
                            x: seat.x,
                            y: seat.y,
                            rotation: seat.rotation,
                            label: document?.title ?? seat.label,
                            documentName: document?.title,
                            placeholder: !document,
                            onSelect: document ? ()=>setDealFor(document) : undefined
                        }, seat.id, false, {
                            fileName: "[project]/app/components/blackjackTable.tsx",
                            lineNumber: 322,
                            columnNumber: 13
                        }, this);
                    })
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/blackjackTable.tsx",
                lineNumber: 258,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/blackjackTable.tsx",
        lineNumber: 161,
        columnNumber: 5
    }, this);
}
_s(BlackjackTable, "/T7Wi/1Im+//8g48HwkAbbp+lCQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = BlackjackTable;
var _c;
__turbopack_context__.k.register(_c, "BlackjackTable");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/components/card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CardSlot",
    ()=>CardSlot
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const CARD_VALUES = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K"
];
const CARD_COLORS = [
    "red",
    "black"
];
function getRandomCardValue() {
    return CARD_VALUES[Math.floor(Math.random() * CARD_VALUES.length)];
}
function getRandomCardColor() {
    return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
}
function CardSlot({ x, y, rotation, label, documentName, placeholder, onSelect }) {
    _s();
    const cardValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "CardSlot.useMemo[cardValue]": ()=>getRandomCardValue()
    }["CardSlot.useMemo[cardValue]"], []);
    const cardColor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "CardSlot.useMemo[cardColor]": ()=>getRandomCardColor()
    }["CardSlot.useMemo[cardColor]"], []);
    if (placeholder) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            "aria-hidden": "true",
            className: "absolute z-20 -translate-x-1/2 -translate-y-1/2",
            style: {
                left: `${x}%`,
                top: `${y}%`
            },
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "flex items-center justify-center rounded-lg border-2 border-dashed border-slate-400/60 bg-slate-500/25",
                style: {
                    width: "clamp(48px, 6vw, 78px)",
                    height: "clamp(68px, 8.4vw, 110px)",
                    transform: `rotate(${rotation}deg)`
                }
            }, void 0, false, {
                fileName: "[project]/app/components/card.tsx",
                lineNumber: 44,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/components/card.tsx",
            lineNumber: 39,
            columnNumber: 7
        }, this);
    }
    const colorClass = cardColor === "red" ? "text-red-600" : "text-zinc-900";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onSelect,
        "aria-label": `Card for ${label}: ${cardValue}${cardValue}`,
        className: "group absolute z-20 -translate-x-1/2 -translate-y-1/2 outline-none",
        style: {
            left: `${x}%`,
            top: `${y}%`
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "flex flex-col items-center justify-between rounded-lg border border-black/10 bg-gradient-to-b\r\n\n        from-white to-zinc-200 text-zinc-700 shadow-[0_8px_18px_-6px_rgba(0,0,0,0.65)]\r\n\n        transition-transform duration-200 ease-out group-hover:-translate-y-2\r\n\n        group-hover:shadow-[0_16px_26px_-8px_rgba(0,0,0,0.7)] group-focus-visible:-translate-y-2\r\n\n        group-focus-visible:ring-2 group-focus-visible:ring-gold cursor-pointer active:scale-95",
            style: {
                width: "clamp(48px, 6vw, 78px)",
                height: "clamp(68px, 8.4vw, 110px)",
                transform: `rotate(${rotation}deg)`,
                padding: "8px"
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: `self-start text-xs font-semibold leading-none opacity-90 ${colorClass}`,
                    children: cardValue
                }, void 0, false, {
                    fileName: "[project]/app/components/card.tsx",
                    lineNumber: 79,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    "aria-hidden": "true",
                    className: `rounded-full border border-current px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${colorClass}`,
                    children: cardValue
                }, void 0, false, {
                    fileName: "[project]/app/components/card.tsx",
                    lineNumber: 80,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: `self-end rotate-180 text-xs font-semibold leading-none opacity-90 ${colorClass}`,
                    children: cardValue
                }, void 0, false, {
                    fileName: "[project]/app/components/card.tsx",
                    lineNumber: 86,
                    columnNumber: 9
                }, this),
                documentName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "max-w-full truncate text-[8px] font-semibold text-slate-700",
                    title: documentName,
                    children: documentName
                }, void 0, false, {
                    fileName: "[project]/app/components/card.tsx",
                    lineNumber: 88,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/components/card.tsx",
            lineNumber: 66,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/components/card.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_s(CardSlot, "PosZsnC4OoyNKPn08vWsyaBKGJY=");
_c = CardSlot;
var _c;
__turbopack_context__.k.register(_c, "CardSlot");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/components/dealModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DealModal",
    ()=>DealModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
/** The backend caps a session at five objectives (SessionCreate's
 * objective_ids has max_length=5), and picking fewer is the point of
 * active recall anyway — a round you can actually finish. */ const MAX_OBJECTIVES = 5;
const DEFAULT_STUDY_MINUTES = 15;
const DEFAULT_BREAK_MINUTES = 5;
const STATUS_STYLE = {
    correct: {
        label: "Solid",
        className: "border-emerald-400/50 text-emerald-300"
    },
    partial: {
        label: "Shaky",
        className: "border-amber-400/50 text-amber-300"
    },
    incorrect: {
        label: "Misread",
        className: "border-red-400/50 text-red-300"
    },
    not_demonstrated: {
        label: "Untouched",
        className: "border-white/25 text-white/50"
    }
};
function DealModal({ document, onClose, onStarted, onError }) {
    _s();
    const [detail, setDetail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [resumable, setResumable] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selected, setSelected] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [studyMinutes, setStudyMinutes] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_STUDY_MINUTES);
    const [breakMinutes, setBreakMinutes] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_BREAK_MINUTES);
    const [starting, setStarting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DealModal.useEffect": ()=>{
            let cancelled = false;
            async function load() {
                try {
                    const [loaded, sessions] = await Promise.all([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getDocument"])(document.id),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listSessions"])(document.id)
                    ]);
                    if (cancelled) return;
                    setDetail(loaded);
                    setResumable(sessions.filter({
                        "DealModal.useEffect.load": (session)=>session.phase !== "completed"
                    }["DealModal.useEffect.load"]));
                    // Pre-select the objectives least well known, so the default round
                    // targets what the progress map says is weakest rather than just
                    // the first few in the document.
                    const ranked = [
                        ...loaded.objectives
                    ].sort({
                        "DealModal.useEffect.load.ranked": (a, b)=>weakness(loaded, b.id) - weakness(loaded, a.id)
                    }["DealModal.useEffect.load.ranked"]);
                    setSelected(ranked.slice(0, MAX_OBJECTIVES).map({
                        "DealModal.useEffect.load": (objective)=>objective.id
                    }["DealModal.useEffect.load"]));
                } catch (cause) {
                    if (!cancelled) onError(cause);
                }
            }
            void load();
            return ({
                "DealModal.useEffect": ()=>{
                    cancelled = true;
                }
            })["DealModal.useEffect"];
        }
    }["DealModal.useEffect"], [
        document.id,
        onError
    ]);
    const toggle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DealModal.useCallback[toggle]": (id)=>{
            setSelected({
                "DealModal.useCallback[toggle]": (current)=>current.includes(id) ? current.filter({
                        "DealModal.useCallback[toggle]": (value)=>value !== id
                    }["DealModal.useCallback[toggle]"]) : current.length >= MAX_OBJECTIVES ? current : [
                        ...current,
                        id
                    ]
            }["DealModal.useCallback[toggle]"]);
        }
    }["DealModal.useCallback[toggle]"], []);
    async function deal() {
        setStarting(true);
        try {
            const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createSession"])({
                document_id: document.id,
                objective_ids: selected,
                study_seconds: Math.round(studyMinutes * 60),
                break_seconds: Math.round(breakMinutes * 60)
            });
            onStarted(session.id);
        } catch (cause) {
            onError(cause);
            setStarting(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-h-[88svh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gold/40 bg-neutral-900 p-6 text-white shadow-2xl",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-start justify-between gap-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs uppercase tracking-[0.3em] text-amber-300",
                                    children: "Deal a hand"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 106,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                    className: "mt-1 font-serif text-2xl text-gold",
                                    children: document.title
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 107,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 105,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            className: "rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 hover:text-white",
                            children: "Close"
                        }, void 0, false, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 109,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/components/dealModal.tsx",
                    lineNumber: 104,
                    columnNumber: 9
                }, this),
                !detail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mt-8 text-center text-sm text-white/50",
                    children: "Reading the table..."
                }, void 0, false, {
                    fileName: "[project]/app/components/dealModal.tsx",
                    lineNumber: 119,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        resumable.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "mt-6 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-sm font-semibold text-amber-200",
                                    children: "Unfinished hands"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 124,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "mt-3 space-y-2",
                                    children: resumable.map((session)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-center justify-between gap-3 text-sm",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white/70",
                                                    children: [
                                                        "Round ",
                                                        session.round_number,
                                                        " · ",
                                                        session.phase,
                                                        session.paused && " (paused)"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/components/dealModal.tsx",
                                                    lineNumber: 128,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>onStarted(session.id),
                                                    className: "rounded-full border border-amber-300/50 px-3 py-1 text-xs text-amber-200 hover:bg-amber-300/10",
                                                    children: "Resume"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/dealModal.tsx",
                                                    lineNumber: 132,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, session.id, true, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 127,
                                            columnNumber: 21
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 125,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 123,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "mt-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-baseline justify-between",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-sm font-semibold text-white/80",
                                            children: "What are we drilling?"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 147,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-xs text-white/45",
                                            children: [
                                                selected.length,
                                                "/",
                                                MAX_OBJECTIVES,
                                                " picked"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 150,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 146,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "mt-3 space-y-2",
                                    children: detail.objectives.map((objective)=>{
                                        const checked = selected.includes(objective.id);
                                        const status = detail.progress[objective.id]?.status ?? "not_demonstrated";
                                        const style = STATUS_STYLE[status];
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: `flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${checked ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-white/5 hover:border-white/25"}`,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                        type: "checkbox",
                                                        checked: checked,
                                                        onChange: ()=>toggle(objective.id),
                                                        // Stops a sixth box from looking clickable when
                                                        // the backend would reject the request anyway.
                                                        disabled: !checked && selected.length >= MAX_OBJECTIVES,
                                                        className: "mt-1 accent-amber-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/components/dealModal.tsx",
                                                        lineNumber: 168,
                                                        columnNumber: 25
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "min-w-0 flex-1",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "block text-sm text-white/90",
                                                                children: objective.title
                                                            }, void 0, false, {
                                                                fileName: "[project]/app/components/dealModal.tsx",
                                                                lineNumber: 178,
                                                                columnNumber: 27
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "mt-0.5 block text-xs text-white/45",
                                                                children: [
                                                                    objective.expected_points.length,
                                                                    " key point",
                                                                    objective.expected_points.length === 1 ? "" : "s",
                                                                    objective.source_pages.length > 0 && ` · p.${objective.source_pages.join(", ")}`
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/app/components/dealModal.tsx",
                                                                lineNumber: 179,
                                                                columnNumber: 27
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/app/components/dealModal.tsx",
                                                        lineNumber: 177,
                                                        columnNumber: 25
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${style.className}`,
                                                        children: style.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/components/dealModal.tsx",
                                                        lineNumber: 186,
                                                        columnNumber: 25
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/components/dealModal.tsx",
                                                lineNumber: 161,
                                                columnNumber: 23
                                            }, this)
                                        }, objective.id, false, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 160,
                                            columnNumber: 21
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 154,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 145,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "mt-6 grid grid-cols-2 gap-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm text-white/70",
                                    children: [
                                        "Study minutes",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "number",
                                            min: 1,
                                            max: 120,
                                            value: studyMinutes,
                                            onChange: (event)=>setStudyMinutes(Number(event.target.value)),
                                            className: "mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-300/70"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 199,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 197,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm text-white/70",
                                    children: [
                                        "Break minutes",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "number",
                                            min: 1,
                                            max: 30,
                                            value: breakMinutes,
                                            onChange: (event)=>setBreakMinutes(Number(event.target.value)),
                                            className: "mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-300/70"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/dealModal.tsx",
                                            lineNumber: 210,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/dealModal.tsx",
                                    lineNumber: 208,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 196,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-2 text-xs text-white/40",
                            children: "Recall isn't on a clock — you dump what you remember and submit when you're done. Breaks get longer on their own if the camera sees you struggling."
                        }, void 0, false, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 220,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: deal,
                            disabled: starting || selected.length === 0 || studyMinutes < 1 || breakMinutes < 1,
                            className: "mt-6 w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950\r\n\n              transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60",
                            children: starting ? "Dealing..." : "Deal me in"
                        }, void 0, false, {
                            fileName: "[project]/app/components/dealModal.tsx",
                            lineNumber: 226,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/components/dealModal.tsx",
                    lineNumber: 121,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/components/dealModal.tsx",
            lineNumber: 103,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/components/dealModal.tsx",
        lineNumber: 102,
        columnNumber: 5
    }, this);
}
_s(DealModal, "mkjykQwUg1aEpQPtaDHrYn2nnRc=");
_c = DealModal;
/** Higher means "needs work more". Drives the default objective picks. */ function weakness(detail, objectiveId) {
    const entry = detail.progress[objectiveId];
    if (!entry) return 3 // never attempted — the most interesting thing to drill
    ;
    switch(entry.status){
        case "incorrect":
            return 4;
        case "partial":
            return 2;
        case "not_demonstrated":
            return 3;
        case "correct":
            return 0;
    }
}
var _c;
__turbopack_context__.k.register(_c, "DealModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/components/landing.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Landing",
    ()=>Landing
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function Landing() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "relative min-h-screen overflow-hidden bg-white",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "absolute left-1/2 top-1/2 h-[130vh] w-[130vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tl from-gray-900 via-purple-900 to-violet-600 w-[200%]"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 7,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 6,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-x-0 bottom-[-80]",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/lasVegas.png",
                    alt: "Las Vegas",
                    className: "w-full h-auto block object-bottom"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 11,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 10,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative flex flex-col items-center justify-center h-[50vh] font-serif font-extrabold text-8xl text-amber-400",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: "RANDOM"
                    }, void 0, false, {
                        fileName: "[project]/app/components/landing.tsx",
                        lineNumber: 15,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: "RANDOM"
                    }, void 0, false, {
                        fileName: "[project]/app/components/landing.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 14,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[22.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-diamond-3-svgrepo-com.svg",
                    alt: "diamond card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 21,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 20,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-45 text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-clover-3-svgrepo-com.svg",
                    alt: "clover card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 25,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 right-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[67.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-heart-3-svgrepo-com.svg",
                    alt: "heart card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 28,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[292.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-spades-three-svgrepo-com.svg",
                    alt: "spades card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 35,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-315 text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-heart-3-svgrepo-com.svg",
                    alt: "heart card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 38,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 right-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[337.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-diamond-3-svgrepo-com.svg",
                    alt: "diamond card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 42,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[22.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-clover-3-svgrepo-com.svg",
                    alt: "clover card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 48,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-45 text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-spades-three-svgrepo-com.svg",
                    alt: "spades card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 51,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 bottom-0 left-[-80] origin-bottom rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[67.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-heart-3-svgrepo-com.svg",
                    alt: "heart card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 54,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[292.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-diamond-3-svgrepo-com.svg",
                    alt: "diamond card",
                    className: "h-full w-full object-cover",
                    style: {
                        filter: 'invert(27%) sepia(89%) saturate(3207%) hue-rotate(340deg) brightness(94%) contrast(96%)'
                    }
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 60,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-315 text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-clover-3-svgrepo-com.svg",
                    alt: "clover card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 64,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 63,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute border-none h-60 w-40 top-0 left-[-80] origin-top rounded-xl overflow-hidden border border-gray-200 bg-white shadow-md rotate-[337.5deg] text-black",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/playing-card-spades-three-svgrepo-com.svg",
                    alt: "spades card",
                    className: "h-full w-full object-cover"
                }, void 0, false, {
                    fileName: "[project]/app/components/landing.tsx",
                    lineNumber: 67,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/landing.tsx",
                lineNumber: 66,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/landing.tsx",
        lineNumber: 5,
        columnNumber: 5
    }, this);
}
_c = Landing;
var _c;
__turbopack_context__.k.register(_c, "Landing");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$blackjackTable$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/blackjackTable.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$landing$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/landing.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function Home() {
    _s();
    // Read straight from the token store rather than mirroring it into state
    // inside an effect. `hydrated` separates "localStorage not readable yet"
    // from "genuinely logged out", so the login card doesn't flash in front
    // of someone who is already signed in.
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useToken"])();
    const hydrated = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHydrated"])();
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("login");
    const [email, setEmail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [username, setUsername] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            if (mode === "signup") {
                // users.username is NOT NULL and unique in the schema, but asking
                // for it separately is one more field between someone and the
                // demo — default it to the email's local part and let them change
                // it only if they want to.
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["signup"])(email, username.trim() || email.split("@")[0], password);
            }
            // login() writes the token to the store, which re-renders this
            // component through useToken() -- nothing to assign here.
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["login"])(email, password);
        } catch (cause) {
            setError(cause instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] ? cause.message : "Something went wrong. Try again.");
        } finally{
            setBusy(false);
        }
    }
    function handleLogout() {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["logout"])();
        setPassword("");
    }
    if (!hydrated) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "min-h-svh bg-neutral-950"
    }, void 0, false, {
        fileName: "[project]/app/page.tsx",
        lineNumber: 52,
        columnNumber: 25
    }, this);
    if (token) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$blackjackTable$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BlackjackTable"], {
        onLogout: handleLogout
    }, void 0, false, {
        fileName: "[project]/app/page.tsx",
        lineNumber: 53,
        columnNumber: 21
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "relative min-h-svh overflow-hidden bg-neutral-950",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0",
                "aria-hidden": "true",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$landing$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Landing"], {}, void 0, false, {
                    fileName: "[project]/app/page.tsx",
                    lineNumber: 58,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "relative z-10 flex min-h-svh items-start justify-center px-6 pt-[38vh]",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full max-w-md rounded-2xl border border-white/25 bg-white/10 p-8 text-white shadow-2xl backdrop-blur-xl",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-center text-xs uppercase tracking-[0.3em] text-amber-300",
                            children: mode === "login" ? "Welcome back" : "Join the table"
                        }, void 0, false, {
                            fileName: "[project]/app/page.tsx",
                            lineNumber: 63,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                            className: "mt-3 text-center font-serif text-4xl font-bold text-amber-400",
                            children: "Enter ze Table"
                        }, void 0, false, {
                            fileName: "[project]/app/page.tsx",
                            lineNumber: 66,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                            onSubmit: handleSubmit,
                            className: "mt-8 space-y-5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-white/80",
                                    children: [
                                        "Email",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            required: true,
                                            type: "email",
                                            value: email,
                                            onChange: (event)=>setEmail(event.target.value),
                                            className: "mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70",
                                            placeholder: "you@example.com"
                                        }, void 0, false, {
                                            fileName: "[project]/app/page.tsx",
                                            lineNumber: 71,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/page.tsx",
                                    lineNumber: 69,
                                    columnNumber: 13
                                }, this),
                                mode === "signup" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-white/80",
                                    children: [
                                        "Display name ",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-white/40",
                                            children: "(optional)"
                                        }, void 0, false, {
                                            fileName: "[project]/app/page.tsx",
                                            lineNumber: 83,
                                            columnNumber: 30
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "text",
                                            value: username,
                                            onChange: (event)=>setUsername(event.target.value),
                                            className: "mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70",
                                            placeholder: email ? email.split("@")[0] : "high-roller"
                                        }, void 0, false, {
                                            fileName: "[project]/app/page.tsx",
                                            lineNumber: 84,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/page.tsx",
                                    lineNumber: 82,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-white/80",
                                    children: [
                                        "Password",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            required: true,
                                            minLength: 8,
                                            type: "password",
                                            value: password,
                                            onChange: (event)=>setPassword(event.target.value),
                                            className: "mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70",
                                            placeholder: mode === "signup" ? "At least 8 characters" : "Enter your password"
                                        }, void 0, false, {
                                            fileName: "[project]/app/page.tsx",
                                            lineNumber: 96,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/page.tsx",
                                    lineNumber: 94,
                                    columnNumber: 13
                                }, this),
                                error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    role: "alert",
                                    className: "rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/app/page.tsx",
                                    lineNumber: 108,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "submit",
                                    disabled: busy,
                                    className: "w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60",
                                    children: busy ? "One moment..." : mode === "login" ? "Log in" : "Create account"
                                }, void 0, false, {
                                    fileName: "[project]/app/page.tsx",
                                    lineNumber: 113,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/page.tsx",
                            lineNumber: 68,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>{
                                setMode(mode === "login" ? "signup" : "login");
                                setError("");
                            },
                            className: "mt-5 w-full text-center text-sm text-white/60 underline-offset-4 hover:text-amber-300 hover:underline",
                            children: mode === "login" ? "No account yet? Sign up" : "Already have an account? Log in"
                        }, void 0, false, {
                            fileName: "[project]/app/page.tsx",
                            lineNumber: 122,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/page.tsx",
                    lineNumber: 62,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/page.tsx",
        lineNumber: 56,
        columnNumber: 5
    }, this);
}
_s(Home, "ndNmCddFUSLEgfN0zrJ/dXf2LrA=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useToken"],
        __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHydrated"]
    ];
});
_c = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "API_BASE",
    ()=>API_BASE,
    "ApiError",
    ()=>ApiError,
    "advanceSession",
    ()=>advanceSession,
    "completeSession",
    ()=>completeSession,
    "createSession",
    ()=>createSession,
    "formatClock",
    ()=>formatClock,
    "getChatHistory",
    ()=>getChatHistory,
    "getDocument",
    ()=>getDocument,
    "getDocumentFileUrl",
    ()=>getDocumentFileUrl,
    "getDocumentObjects",
    ()=>getDocumentObjects,
    "getSession",
    ()=>getSession,
    "getToken",
    ()=>getToken,
    "getWellbeing",
    ()=>getWellbeing,
    "listAttempts",
    ()=>listAttempts,
    "listDocuments",
    ()=>listDocuments,
    "listSessions",
    ()=>listSessions,
    "login",
    ()=>login,
    "logout",
    ()=>logout,
    "pauseSession",
    ()=>pauseSession,
    "remainingSeconds",
    ()=>remainingSeconds,
    "resumeSession",
    ()=>resumeSession,
    "sendChat",
    ()=>sendChat,
    "setToken",
    ()=>setToken,
    "signup",
    ()=>signup,
    "submitRecall",
    ()=>submitRecall,
    "uploadDocument",
    ()=>uploadDocument,
    "useHydrated",
    ()=>useHydrated,
    "useToken",
    ()=>useToken
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
;
/**
 * Typed client for the FastAPI backend (`backend/`).
 *
 * Everything the UI knows about the server goes through here, so the
 * request shapes stay in one place and match `backend/schemas/study.py`
 * rather than being rebuilt ad hoc in each component.
 *
 * The backend is a separate origin from Next.js (FastAPI on :8000, Next on
 * :3000), so requests are plain cross-origin fetches with a bearer token —
 * `backend/core/config.py`'s CORS_ORIGINS has to list this app's origin.
 */ /** Where the backend lives.
 *
 * Resolution order matters for the packaged desktop app:
 *
 * 1. `window.studyLoopBackendUrl` — injected by the Electron preload from
 *    the main process. This is the only one that can change *after* the UI
 *    was built, which is what lets one installer point at a different
 *    deployment (see frontend/main.js's resolveBackendUrl).
 * 2. `NEXT_PUBLIC_API_URL` — inlined at build time. Used by `next dev` and
 *    by a browser-hosted build.
 * 3. Localhost, for someone running everything on their own machine.
 *
 * Read once at module load: the preload runs before any page script, so
 * the value is already there, and a getter re-reading it per request would
 * let the base URL change mid-session. */ function resolveApiBase() {
    const fromKiosk = ("TURBOPACK compile-time truthy", 1) ? window.studyLoopBackendUrl : "TURBOPACK unreachable";
    const configured = fromKiosk || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return configured.replace(/\/$/, "");
}
const API_BASE = resolveApiBase();
const API_V1 = `${API_BASE}/api/v1`;
const TOKEN_KEY = "studyloop.token";
class ApiError extends Error {
    status;
    constructor(status, message){
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}
function getToken() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch  {
        return null;
    }
}
function setToken(token) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        else window.localStorage.removeItem(TOKEN_KEY);
    } catch  {
    // Private-mode / blocked storage: the session still works for as long
    // as the tab lives, it just won't survive a reload.
    }
    notify();
}
// --- token as an external store ------------------------------------------
// Components read the token with useToken() rather than copying it into
// state inside an effect. Besides being the pattern React actually wants
// for "state that lives outside React", it makes a logout in one window
// take effect in the others: the `storage` event fires cross-tab, and
// notify() covers same-tab writes, which `storage` deliberately skips.
const listeners = new Set();
function notify() {
    for (const listener of listeners)listener();
}
function subscribe(listener) {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return ()=>{
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
    };
}
function useToken() {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribe, getToken, {
        "useToken.useSyncExternalStore": ()=>null
    }["useToken.useSyncExternalStore"]);
}
_s(useToken, "FpwL93IKMLJZuQQXefVtWynbBPQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]
    ];
});
function useHydrated() {
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribe, alwaysTrue, alwaysFalse);
}
_s1(useHydrated, "FpwL93IKMLJZuQQXefVtWynbBPQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]
    ];
});
const alwaysTrue = ()=>true;
const alwaysFalse = ()=>false;
// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------
async function failure(response) {
    let detail = `Request failed (${response.status})`;
    try {
        const body = await response.json();
        if (typeof body?.detail === "string") {
            detail = body.detail;
        } else if (Array.isArray(body?.detail)) {
            // Pydantic validation errors arrive as a list of {loc, msg, ...}.
            detail = body.detail.map((item)=>item?.msg).filter(Boolean).join("; ") || detail;
        }
    } catch  {
    // Non-JSON error body (a proxy error page, say) — keep the generic text.
    }
    return new ApiError(response.status, detail);
}
async function request(path, init = {}) {
    const token = getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response;
    try {
        response = await fetch(`${API_V1}${path}`, {
            ...init,
            headers
        });
    } catch  {
        // fetch() only rejects on a transport failure, and the overwhelmingly
        // likely cause here is the backend not running — worth saying so
        // instead of surfacing "Failed to fetch".
        throw new ApiError(0, `Cannot reach the backend at ${API_BASE}. Is it running?`);
    }
    if (!response.ok) throw await failure(response);
    if (response.status === 204) return undefined;
    return await response.json();
}
function postJson(path, body) {
    return request(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
}
async function signup(email, username, password) {
    return postJson("/auth/signup", {
        email,
        username,
        password
    });
}
async function login(email, password) {
    // OAuth2PasswordRequestForm is form-encoded, not JSON, and carries the
    // email in its "username" field (see backend/api/v1/endpoints/auth.py).
    const form = new URLSearchParams({
        username: email,
        password
    });
    const result = await request("/auth/login/access-token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
    });
    setToken(result.access_token);
    return result.access_token;
}
function logout() {
    setToken(null);
}
async function uploadDocument(file) {
    const body = new FormData();
    body.append("file", file);
    // Content-Type is deliberately unset: the browser has to add it itself
    // so it can include the multipart boundary.
    return request("/documents", {
        method: "POST",
        body
    });
}
function listDocuments() {
    return request("/documents");
}
function getDocument(documentId) {
    return request(`/documents/${documentId}`);
}
function getDocumentObjects(documentId) {
    return request(`/documents/${documentId}/content`);
}
async function getDocumentFileUrl(documentId) {
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_V1}/documents/${documentId}/file`, {
        headers
    });
    if (!response.ok) throw await failure(response);
    return URL.createObjectURL(await response.blob());
}
// ---------------------------------------------------------------------------
// Study sessions
// ---------------------------------------------------------------------------
/** Record when a session snapshot reached this machine.
 *
 * Everything about the countdown is derived from the gap between
 * `deadline` and `server_time` (both server-side) plus how long ago this
 * arrived (both client-side). Neither number is ever compared across
 * machines, so a browser clock that is minutes off changes nothing. */ function stamp(session) {
    return {
        ...session,
        receivedAt: Date.now()
    };
}
async function createSession(params) {
    return stamp(await postJson("/sessions", params));
}
async function listSessions(documentId) {
    const query = documentId === undefined ? "" : `?document_id=${documentId}`;
    return (await request(`/sessions${query}`)).map(stamp);
}
async function getSession(sessionId) {
    return stamp(await request(`/sessions/${sessionId}`));
}
async function advanceSession(sessionId) {
    return stamp(await postJson(`/sessions/${sessionId}/advance`, {}));
}
async function pauseSession(sessionId) {
    return stamp(await postJson(`/sessions/${sessionId}/pause`, {}));
}
async function resumeSession(sessionId) {
    return stamp(await postJson(`/sessions/${sessionId}/resume`, {}));
}
async function completeSession(sessionId) {
    return stamp(await postJson(`/sessions/${sessionId}/complete`, {}));
}
function submitRecall(sessionId, submissionId, text) {
    return postJson(`/sessions/${sessionId}/recall`, {
        submission_id: submissionId,
        text
    });
}
function listAttempts(sessionId) {
    return request(`/sessions/${sessionId}/attempts`);
}
function sendChat(sessionId, message) {
    return postJson(`/sessions/${sessionId}/chat`, {
        message
    });
}
function getChatHistory(sessionId) {
    return request(`/sessions/${sessionId}/chat`);
}
function getWellbeing(sessionId) {
    return request(`/sessions/${sessionId}/wellbeing`);
}
function remainingSeconds(session) {
    if (session.paused) return session.remaining_seconds;
    if (session.deadline === null) return null;
    const leftAtSnapshot = session.deadline - session.server_time;
    const sinceSnapshot = (Date.now() - session.receivedAt) / 1000;
    return Math.max(0, leftAtSnapshot - sinceSnapshot);
}
function formatClock(seconds) {
    if (seconds === null) return "--:--";
    const whole = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(whole / 60);
    return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/kiosk.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "inKiosk",
    ()=>inKiosk,
    "kiosk",
    ()=>kiosk,
    "useInKiosk",
    ()=>useInKiosk
]);
/**
 * Typed view of the Electron bridge exposed by `frontend/preload.js`.
 *
 * The same Next.js app runs in two places — inside the Electron kiosk, and
 * in a plain browser during development — so every one of these is
 * optional at runtime. `kiosk()` returns null in the browser, and callers
 * are expected to degrade rather than break: the browser's own file input
 * stands in for the native picker, and Presage capture simply doesn't run
 * (it needs a Node process with the SmartSpectra SDK, which a web page
 * cannot host).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
function kiosk() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return window.kioskAPI ?? null;
}
function inKiosk() {
    return kiosk() !== null;
}
// Whether the bridge exists is a fact about the environment, not React
// state, and it is false during server rendering. useSyncExternalStore is
// how a component reads that without copying it into state from an effect.
const noopSubscribe = ()=>()=>{};
const bridgePresent = ()=>kiosk() !== null;
const notPresent = ()=>false;
function useInKiosk() {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(noopSubscribe, bridgePresent, notPresent);
}
_s(useInKiosk, "FpwL93IKMLJZuQQXefVtWynbBPQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSyncExternalStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_0f80mxd._.js.map