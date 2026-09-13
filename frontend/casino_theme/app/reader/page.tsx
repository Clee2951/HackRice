"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { StudyRoom } from "../components/studyRoom";
import { getToken } from "@/lib/api";

function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("session");
  const sessionId = raw === null ? NaN : Number(raw);

  // A study session is per-user state behind a bearer token, so an
  // unauthenticated arrival here (bookmark, reload after logout) belongs
  // back at the login card rather than at a wall of 401s.
  useEffect(() => {
    if (!getToken() || !Number.isFinite(sessionId)) router.replace("/");
  }, [router, sessionId]);

  if (!Number.isFinite(sessionId)) return <div className="min-h-svh bg-neutral-950" />;
  return <StudyRoom sessionId={sessionId} />;
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-neutral-950" />}>
      <ReaderContent />
    </Suspense>
  );
}
