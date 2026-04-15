const { PluginAPI } = require('../../../plugins/plugin-api');
const { SprintEngine } = require('./sprint-engine');
const { GoalTracker } = require('./goal-tracker');
const { SnapshotManager } = require('./snapshot-manager');
const { ProjectManager } = require('./project-manager');

class WritingStudioPlugin extends PluginAPI {
  init(context) {
    this.context = context;

    this.sprintEngine = new SprintEngine({
      onEvent: (name, data) => context.events.emit(name, data)
    });
    this.goalTracker = new GoalTracker(context.settings);
    this.snapshotManager = new SnapshotManager(context.settings);
    this.projectManager = new ProjectManager({
      readFile: (p) => context.ipc.invoke('read-file', p),
      writeFile: (p, c) => context.ipc.invoke('write-file', p, c),
      fileExists: (p) => context.ipc.invoke('path-exists', p),
      listDir: (p) => context.ipc.invoke('list-directory', p)
    });

    this._engines = {
      sprint: this.sprintEngine,
      goals: this.goalTracker,
      snapshots: this.snapshotManager,
      projects: this.projectManager
    };

    this._registerCommands(context);
    this._registerStatusBar(context);
  }

  _registerCommands(context) {
    const { sprintEngine, snapshotManager, goalTracker } = this;

    context.commands.register('start-sprint', 'Studio: Start Sprint', () => {
      const duration = context.settings.get('sprintDuration') || 25;
      const content = context.editor.getContent() || '';
      const words = content.split(/\s+/).filter(Boolean).length;
      sprintEngine.start(duration, words);
    }, 'Ctrl+Alt+S');

    context.commands.register('stop-sprint', 'Studio: Stop Sprint', () => {
      if (!sprintEngine.isActive()) return;
      const content = context.editor.getContent() || '';
      const words = content.split(/\s+/).filter(Boolean).length;
      const result = sprintEngine.stop(words);
      goalTracker.addWords(result.wordDelta);
      context.events.emit('sprint:stopped', result);
    }, 'Ctrl+Alt+Shift+S');

    context.commands.register('take-snapshot', 'Studio: Take Snapshot', () => {
      const content = context.editor.getContent() || '';
      snapshotManager.create(content, 'manual');
      context.events.emit('snapshot:created', {});
    }, 'Ctrl+Alt+N');

    context.commands.register('restore-last-snapshot', 'Studio: Restore Last Snapshot', () => {
      const snaps = snapshotManager.list();
      if (snaps.length === 0) return;
      const content = snapshotManager.restore(snaps[0].id);
      context.editor.insertAtCursor(content);
    }, 'Ctrl+Alt+Z');

    context.commands.register('new-project', 'Studio: New Project', () => {
      context.events.emit('studio:new-project', {});
    });

    context.commands.register('compile-manuscript', 'Studio: Compile Manuscript', () => {
      context.events.emit('studio:compile', {});
    }, 'Ctrl+Alt+E');

    context.commands.register('proofread-document', 'Studio: Proofread Document', () => {
      if (context.events.hasHandler('ai:analyze')) {
        const content = context.editor.getContent() || '';
        context.events.emit('ai:analyze', { text: content, type: 'grammar' });
      }
    }, 'Ctrl+Alt+G');
  }

  _registerStatusBar(context) {
    context.statusBar.registerIndicator('word-goal', {
      text: '0/1000',
      tooltip: 'Daily word goal progress'
    });
    context.statusBar.registerIndicator('sprint-timer', {
      text: '',
      tooltip: 'Writing sprint timer'
    });
  }

  deactivate() {
    if (this._sprintInterval) clearInterval(this._sprintInterval);
  }

  getEngines() {
    return this._engines;
  }
}

module.exports = { Plugin: WritingStudioPlugin };
