"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PdfRead } from "../components/pdfRead";

function toFileUrl(filePath: string) {
  if (filePath.startsWith("file://")) return filePath;
  return `file:///${encodeURI(filePath.replaceAll("\\", "/"))}`;
}

function ReaderContent() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("path");
  const fileName = searchParams.get("name") || "Selected study document";

  return (
    <PdfRead
      document={
        filePath
          ? { title: fileName, src: toFileUrl(filePath) }
          : undefined
      }
    />
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-neutral-950" />}>
      <ReaderContent />
    </Suspense>
  );
}
