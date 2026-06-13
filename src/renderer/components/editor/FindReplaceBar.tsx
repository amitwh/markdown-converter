import { useEffect, useRef, useCallback, useState } from 'react';
import {
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
  getSearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { getActiveView } from '@/lib/editor-commands';
import { useAppStore } from '@/stores/app-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X, ChevronDown, ChevronUp, Replace, ReplaceAll, CaseSensitive, Regex } from 'lucide-react';

export function FindReplaceBar() {
  const findBarOpen = useAppStore((s) => s.findBarOpen);
  const toggleFindBar = useAppStore((s) => s.toggleFindBar);
  const searchRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null);

  const executeCommand = useCallback((fn: (view: any) => any) => {
    const view = getActiveView();
    if (!view) return false;
    const result = fn(view);
    updateMatchCount();
    view.focus();
    return result;
  }, []);

  const updateMatchCount = useCallback(() => {
    const view = getActiveView();
    if (!view) {
      setMatchInfo(null);
      return;
    }
    const query = getSearchQuery(view.state);
    if (!query) {
      setMatchInfo(null);
      return;
    }
    const searchState = view.state.field(
      // @ts-expect-error - internal field accessor
      query.spec.create() &&
        (() => {
          for (const facet of view.state.field) return null;
        })(),
      false
    );
    try {
      // @ts-expect-error - search state inspection
      const panel = view.state.facet?.(searchPanelFacet)?.[0];
      setMatchInfo(null);
    } catch {
      setMatchInfo(null);
    }
  }, []);

  const handleFindNext = useCallback(() => {
    executeCommand(findNext);
  }, [executeCommand]);

  const handleFindPrev = useCallback(() => {
    executeCommand(findPrevious);
  }, [executeCommand]);

  const handleReplace = useCallback(() => {
    executeCommand(replaceNext);
  }, [executeCommand]);

  const handleReplaceAll = useCallback(() => {
    executeCommand(replaceAll);
  }, [executeCommand]);

  const handleClose = useCallback(() => {
    const view = getActiveView();
    if (view) closeSearchPanel(view);
    toggleFindBar();
    view?.focus();
  }, [toggleFindBar]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const view = getActiveView();
      if (!view) return;
      setSearchQuery(view, {
        search: value,
        caseSensitive,
        regexp: useRegex,
      });
    },
    [caseSensitive, useRegex]
  );

  const handleReplaceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const view = getActiveView();
    if (!view) return;
    const query = getSearchQuery(view.state);
    if (query) {
      setSearchQuery(view, {
        search: query.search,
        caseSensitive: query.caseSensitive ?? false,
        regexp: query.regexp ?? false,
        replace: e.target.value,
      });
    }
  }, []);

  useEffect(() => {
    if (findBarOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [findBarOpen]);

  useEffect(() => {
    const handler = () => {
      if (!useAppStore.getState().findBarOpen) {
        useAppStore.getState().toggleFindBar();
      }
    };
    window.addEventListener('mc:find-toggle', handler);
    return () => window.removeEventListener('mc:find-toggle', handler);
  }, []);

  if (!findBarOpen) return null;

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-background px-2 py-1">
      <Input
        ref={searchRef}
        placeholder="Find..."
        className="h-7 w-48 text-xs"
        onChange={handleSearchChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey ? handleFindPrev() : handleFindNext();
          }
          if (e.key === 'Escape') handleClose();
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            replaceRef.current?.focus();
          }
        }}
        data-testid="find-input"
      />

      <button
        type="button"
        className={cn(
          'rounded p-0.5 hover:bg-accent',
          caseSensitive && 'bg-accent text-accent-foreground'
        )}
        onClick={() => {
          setCaseSensitive((v) => {
            const next = !v;
            const view = getActiveView();
            if (view) {
              const query = getSearchQuery(view.state);
              if (query) {
                setSearchQuery(view, {
                  search: query.search,
                  caseSensitive: next,
                  regexp: useRegex,
                  replace: query.replace,
                });
              }
            }
            return next;
          });
        }}
        aria-label="Case sensitive"
        data-testid="find-case-sensitive"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={cn(
          'rounded p-0.5 hover:bg-accent',
          useRegex && 'bg-accent text-accent-foreground'
        )}
        onClick={() => {
          setUseRegex((v) => {
            const next = !v;
            const view = getActiveView();
            if (view) {
              const query = getSearchQuery(view.state);
              if (query) {
                setSearchQuery(view, {
                  search: query.search,
                  caseSensitive,
                  regexp: next,
                  replace: query.replace,
                });
              }
            }
            return next;
          });
        }}
        aria-label="Use regex"
        data-testid="find-regex"
      >
        <Regex className="h-3.5 w-3.5" />
      </button>

      <Input
        ref={replaceRef}
        placeholder="Replace..."
        className="h-7 w-48 text-xs"
        onChange={handleReplaceChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleReplace();
          if (e.key === 'Escape') handleClose();
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            searchRef.current?.focus();
          }
        }}
        data-testid="replace-input"
      />

      <Button size="sm" variant="ghost" onClick={handleFindPrev} aria-label="Find previous">
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleFindNext} aria-label="Find next">
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleReplace} aria-label="Replace">
        <Replace className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleReplaceAll} aria-label="Replace all">
        <ReplaceAll className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleClose} aria-label="Close">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
