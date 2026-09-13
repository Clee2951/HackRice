"use client";

import { useEffect, useState } from "react";
import { getDocumentFileUrl } from "@/lib/api";

/**
 * The uploaded original, shown in an iframe.
 *
 * The file has to be fetched rather than linked: `/documents/{id}/file`
 * requires the bearer token and an `<iframe src>` can't carry one. The
 * blob URL that comes back is revoked on unmount — without that, every
 * phase change that hides and re-shows this pane leaks another copy of
 * the PDF into memory for the life of the tab.
 */
export function DocumentPane({
  documentId,
  onError,
}: {
  documentId: number;
  onError: (cause: unknown) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;

    async function load() {
      try {
        const objectUrl = await getDocumentFileUrl(documentId);
        if (revoked) {
          // Unmounted while the fetch was in flight.
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setUrl(objectUrl);
      } catch (cause) {
        if (!revoked) onError(cause);
      }
    }

    void load();
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [documentId, onError]);

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-white/40">
        Opening your document...
      </div>
    );
  }

  return <iframe title="Study document" src={url} className="min-h-0 flex-1 bg-white" />;
}
