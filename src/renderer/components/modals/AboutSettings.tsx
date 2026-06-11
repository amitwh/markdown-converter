import { useEffect, useState } from 'react';
import { ipc } from '@/lib/ipc';

export function AboutSettings() {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    ipc.app.getVersion().then((r) => {
      if (r.ok && typeof r.data === 'string') setVersion(r.data);
    });
  }, []);

  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-semibold">MarkdownConverter</h3>
      <p className="text-muted-foreground">Version {version}</p>
      <p>
        <a
          href="https://github.com/amitwh/markdown-converter"
          className="text-brand hover:underline"
          onClick={(e) => {
            e.preventDefault();
            ipc.app.openExternal('https://github.com/amitwh/markdown-converter');
          }}
        >
          GitHub repository
        </a>
      </p>
      <p>
        <a
          href="https://concreteinfo.co.in"
          className="text-brand hover:underline"
          onClick={(e) => {
            e.preventDefault();
            ipc.app.openExternal('https://concreteinfo.co.in');
          }}
        >
          ConcreteInfo
        </a>
      </p>
      <p className="text-xs text-muted-foreground">© ConcreteInfo. Licensed under MIT.</p>
    </div>
  );
}
