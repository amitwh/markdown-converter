import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { analyzeText } from '@/lib/writing-analytics';
import { BookOpen, Clock, FileText, BarChart2, Target, Award, Sparkles, Mic } from 'lucide-react';

export function WritingAnalyticsDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const isOpen = useAppStore((s) => s.modal.kind) === 'writing-analytics';
  const { dailyGoal, setSetting } = useSettingsStore();
  const activeId = useEditorStore((s) => s.activeId);
  const buffer = activeId ? useEditorStore((s) => s.buffers.get(activeId)) : null;
  const content = buffer?.content || '';

  const metrics = analyzeText(content);
  const percentage = dailyGoal > 0 ? Math.round((metrics.wordCount / dailyGoal) * 100) : 0;
  const isGoalReached = metrics.wordCount >= dailyGoal && dailyGoal > 0;

  // Track celebration state to trigger an animation on goal completion
  const [celebrated, setCelebrated] = useState(false);

  useEffect(() => {
    if (isGoalReached && !celebrated) {
      setCelebrated(true);
    } else if (!isGoalReached && celebrated) {
      setCelebrated(false);
    }
  }, [isGoalReached, celebrated]);

  // Find max count for word cloud scaling
  const maxWordCount = metrics.topWords.length > 0 ? Math.max(...metrics.topWords.map((w) => w.count)) : 1;

  // Helper to determine color coding for Flesch Readability Ease
  const getReadabilityColor = (score: number) => {
    if (score >= 70) return 'text-[#1a7a56]'; // Easy / Very Easy
    if (score >= 50) return 'text-amber-500'; // Standard
    return 'text-rose-500'; // Difficult / Very Difficult
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh] p-6">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-brand" />
            <DialogTitle className="text-xl font-bold font-display">Writing Analytics</DialogTitle>
          </div>
          <DialogDescription>
            Real-time readability metrics, vocabulary analysis, and progress towards your daily word goal.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Readability, Structure, Timing */}
          <div className="space-y-6">
            {/* Readability Card */}
            <div className="rounded-xl border border-border bg-card/30 p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
                <BookOpen className="h-5 w-5 text-brand" />
                <h3 className="font-semibold text-sm">Readability</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Flesch Reading Ease</p>
                  <p className={`text-2xl font-bold ${getReadabilityColor(metrics.fleschEase)}`}>
                    {metrics.fleschEase}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {metrics.readabilityLabel}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Grade Level</p>
                  <p className="text-2xl font-bold text-foreground">
                    {metrics.fleschGrade}
                  </p>
                  <p className="text-xs text-muted-foreground">US school grade</p>
                </div>
              </div>
            </div>

            {/* Structure Card */}
            <div className="rounded-xl border border-border bg-card/30 p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
                <FileText className="h-5 w-5 text-brand" />
                <h3 className="font-semibold text-sm">Structure</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="p-2 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Words</p>
                  <p className="text-lg font-bold text-foreground">{metrics.wordCount}</p>
                </div>
                <div className="p-2 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Sentences</p>
                  <p className="text-lg font-bold text-foreground">{metrics.sentenceCount}</p>
                </div>
                <div className="p-2 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Paragraphs</p>
                  <p className="text-lg font-bold text-foreground">{metrics.paragraphCount}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average Sentence Length:</span>
                  <span className="font-semibold">{metrics.avgSentenceLength} words</span>
                </div>
                {metrics.longestSentence && (
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-muted-foreground mb-1">
                      Longest Sentence ({metrics.longestSentenceLength} words):
                    </p>
                    <p className="italic bg-secondary/35 p-2 rounded text-muted-foreground leading-relaxed">
                      "{metrics.longestSentence}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Timing Card */}
            <div className="rounded-xl border border-border bg-card/30 p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
                <Clock className="h-5 w-5 text-brand" />
                <h3 className="font-semibold text-sm">Timing</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand/10 rounded-lg text-brand">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reading Time</p>
                    <p className="text-base font-semibold">{metrics.readingTime} min</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#1a7a56]/10 rounded-lg text-[#1a7a56]">
                    <Mic className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Speaking Time</p>
                    <p className="text-base font-semibold">{metrics.speakingTime} min</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Word Goal, Vocabulary */}
          <div className="space-y-6">
            {/* Word Goal Card */}
            <div
              className={`rounded-xl border p-4 shadow-sm transition-all duration-500 ${
                isGoalReached
                  ? 'border-[#1a7a56] bg-[#1a7a56]/5 animate-pulse-slow'
                  : 'border-border bg-card/30'
              }`}
            >
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  {isGoalReached ? (
                    <Award className="h-5 w-5 text-[#1a7a56]" />
                  ) : (
                    <Target className="h-5 w-5 text-brand" />
                  )}
                  <h3 className="font-semibold text-sm">Daily Word Goal</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Target:</span>
                  <Input
                    type="number"
                    min={1}
                    value={dailyGoal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) {
                        setSetting('dailyGoal', val);
                      }
                    }}
                    className="h-7 w-20 text-xs px-2"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {metrics.wordCount} / {dailyGoal} words
                  </span>
                  <span className={isGoalReached ? 'text-[#1a7a56]' : 'text-brand'}>
                    {percentage}%
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      isGoalReached ? 'bg-[#1a7a56]' : 'bg-brand'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                {isGoalReached && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#1a7a56]/10 p-2 text-xs text-[#1a7a56] font-medium border border-[#1a7a56]/20">
                    <Sparkles className="h-4 w-4 animate-spin-slow" />
                    <span>Goal accomplished! Keep writing to set a new record.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Vocabulary & Word Cloud Card */}
            <div className="rounded-xl border border-border bg-card/30 p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <h3 className="font-semibold text-sm">Vocabulary & Top Words</h3>
                <div className="text-right text-xs">
                  <span className="text-muted-foreground">Lexical Diversity: </span>
                  <span className="font-bold text-foreground">{metrics.lexicalDiversity}%</span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-4">
                Unique words: <span className="font-semibold text-foreground">{metrics.uniqueWordCount}</span> /{' '}
                {metrics.wordCount} ({metrics.wordCount > 0 ? Math.round((metrics.uniqueWordCount / metrics.wordCount) * 100) : 0}%)
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Word Frequency Cloud</p>
                {metrics.topWords.length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-card/10 text-xs text-muted-foreground">
                    Add more words to see vocabulary statistics
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 p-3 bg-secondary/20 rounded-lg min-h-32 border border-border/30">
                    {metrics.topWords.map(({ word, count }) => {
                      // Normalize count relative to maximum frequency for font scaling
                      const scale = maxWordCount > 0 ? count / maxWordCount : 0.5;
                      const size = Math.round((0.8 + scale * 0.8) * 10) / 10; // 0.8rem to 1.6rem
                      const opacity = Math.round((0.5 + scale * 0.5) * 10) / 10; // 0.5 to 1.0

                      return (
                        <span
                          key={word}
                          style={{
                            fontSize: `${size}rem`,
                            opacity: opacity,
                          }}
                          className="font-medium inline-block text-brand hover:text-brand-light transition-colors duration-200 cursor-default"
                          title={`Occurred ${count} time${count === 1 ? '' : 's'}`}
                        >
                          {word}
                          <sub className="text-[9px] text-muted-foreground font-normal ml-0.5">
                            ({count})
                          </sub>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button onClick={closeModal}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
