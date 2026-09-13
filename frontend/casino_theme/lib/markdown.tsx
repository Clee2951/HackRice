import { Fragment, ReactNode } from "react";

/**
 * A deliberately small Markdown subset renderer for AI-written lessons.
 *
 * Returns React nodes rather than an HTML string: the content comes from
 * Gemini, and `dangerouslySetInnerHTML` on model output is how prompt
 * injection in a source document turns into script execution in the
 * reader. React escapes every text node here by construction, so the worst
 * a malicious PDF can do is make its "lesson" look odd.
 *
 * Covers what `prompts.LESSON` actually asks for — headings, bold, italics,
 * inline code, bullet and numbered lists, paragraphs. Anything else falls
 * through as plain text instead of being silently dropped.
 */

type Props = { markdown: string; className?: string };

export function Markdown({ markdown, className }: Props) {
  return <div className={className}>{renderBlocks(markdown)}</div>;
}

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p${blocks.length}`} className="mb-3 leading-relaxed">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li key={index} className="mb-1">
        {renderInline(item)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`l${blocks.length}`} className="mb-3 list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`l${blocks.length}`} className="mb-3 list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      // h1/h2 inside a side panel would out-shout the panel's own title,
      // so every level renders at the same size and leans on weight and
      // color for hierarchy instead.
      blocks.push(
        <p
          key={`h${blocks.length}`}
          className={`mb-2 mt-3 font-semibold ${level <= 2 ? "text-amber-200" : "text-white/85"}`}
        >
          {renderInline(heading[2])}
        </p>,
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

// Bold, italic, and inline code. Ordered longest-delimiter-first so `**`
// is consumed before `*`.
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;

function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE);
  return parts.map((part, index) => {
    if (!part) return null;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.9em] text-amber-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
