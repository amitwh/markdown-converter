import { FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { insertSnippet } from '@/lib/editor-commands';

const TEMPLATES = [
  { name: 'Blog Post', file: 'blog-post.md', description: 'Article with frontmatter' },
  { name: 'Meeting Notes', file: 'meeting-notes.md', description: 'Agenda, notes, action items' },
  { name: 'Technical Spec', file: 'technical-spec.md', description: 'Requirements and architecture' },
  { name: 'Changelog', file: 'changelog.md', description: 'Keep a Changelog format' },
  { name: 'README', file: 'readme.md', description: 'Project documentation' },
  { name: 'Project Plan', file: 'project-plan.md', description: 'Goals, milestones, timeline' },
  { name: 'API Docs', file: 'api-docs.md', description: 'API endpoint documentation' },
  { name: 'Tutorial', file: 'tutorial.md', description: 'Step-by-step guide' },
  { name: 'Release Notes', file: 'release-notes.md', description: 'Version release summary' },
  { name: 'Comparison', file: 'comparison.md', description: 'Feature comparison table' },
];

export function Templates() {
  const handleSelect = async (file: string) => {
    try {
      const content = await window.electronAPI.invoke('load-template', file);
      if (content) {
        const success = insertSnippet(content);
        if (success) {
          toast.success(`Template "${file}" inserted successfully`);
        } else {
          toast.error('No active document open');
        }
      } else {
        toast.error('Failed to load template content');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Error loading template');
    }
  };

  return (
    <div className="flex flex-col gap-1.5 p-1 text-xs">
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
        {TEMPLATES.map((t) => (
          <div
            key={t.file}
            onClick={() => handleSelect(t.file)}
            className="group flex items-start gap-2.5 rounded border border-border/40 bg-card/20 p-2 hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground/80 group-hover:text-brand shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground truncate">{t.name}</span>
                <Download className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground/80 hover:text-brand transition-opacity" />
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
