import { useEditorStore } from '@/stores/editor-store';

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(HEADING_RE.source, 'gm');
  let lineNum = 1;
  for (const line of content.split('\n')) {
    re.lastIndex = 0;
    match = re.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: lineNum,
      });
    }
    lineNum++;
  }
  return headings;
}

export function Outline() {
  const activeId = useEditorStore((s) => s.activeId);
  const buffers = useEditorStore((s) => s.buffers);

  if (!activeId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <span>No file open</span>
      </div>
    );
  }

  const buffer = buffers.get(activeId);
  if (!buffer) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <span>No file open</span>
      </div>
    );
  }

  const headings = extractHeadings(buffer.content);

  if (headings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <span>No headings</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => {}}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-left text-xs hover:bg-accent"
          style={{ paddingLeft: `${(h.level - 1) * 16 + 8}px` }}
        >
          <span className="truncate text-muted-foreground">#{h.level}</span>
          <span className="truncate">{h.text}</span>
        </button>
      ))}
    </div>
  );
}
