import { ThemeToggle } from './components/theme-toggle';
import { Button } from './components/ui/button';

function App() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-brand" aria-label="MarkdownConverter logo" />
          <h1 className="text-sm font-semibold">MarkdownConverter</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">File</Button>
          <Button variant="ghost" size="sm">Edit</Button>
          <Button variant="ghost" size="sm">View</Button>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Shell skeleton — implementation phases in progress.</p>
      </main>
    </div>
  );
}

export default App;