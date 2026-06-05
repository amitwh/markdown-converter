import { Bold, Italic, List, ListOrdered, Code, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Toolbar() {
  return (
    <div className="flex h-10 items-center gap-1 border-b border-border bg-card/10 px-3">
      <Button variant="ghost" size="icon" aria-label="Bold"><Bold className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Italic"><Italic className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Unordered list"><List className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Ordered list"><ListOrdered className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Code"><Code className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Link"><LinkIcon className="h-4 w-4" /></Button>
    </div>
  );
}