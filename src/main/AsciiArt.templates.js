/**
 * ASCII art templates — named pre-drawn diagrams and frames.
 *
 * Sourced from src/ascii-generator.html:596-626 and src/renderer.js:6542-6697
 * (the `getASCIITemplate()` function). 19 entries; unknown names resolve to ''.
 * `arrow-up` is the only template authored for this module — it completes the
 * arrow triplet (right, down, up) and does not exist verbatim in either source.
 *
 * @module AsciiArt.templates
 */
'use strict';

const ASCII_TEMPLATES = {
  // ----- arrows -----
  'arrow-right':
    '    ┌─────────────────────┐\n──▶│  Process or Action  │──▶\n    └─────────────────────┘',
  'arrow-down':
    '        │\n        ▼\n┌───────────────┐\n│   Process     │\n└───────────────┘\n        │\n        ▼',
  // Newly authored to complete the arrow triplet. Mirrors arrow-down with
  // upward flow direction.
  'arrow-up':
    '        ▲\n        │\n┌───────────────┐\n│   Process     │\n└───────────────┘\n        │\n        ▲',

  // ----- shapes -----
  decision:
    '       ╱╲\n      ╱  ╲\n     ╱ ?  ╲\n    ╱      ╲\n   ╱────────╲\n  ╱          ╲\n YES        NO\n  │          │\n  ▼          ▼',
  process: '┌─────┐   ┌─────┐   ┌─────┐\n│  1  │──▶│  2  │──▶│  3  │\n└─────┘   └─────┘   └─────┘',
  flowchart:
    '┌─────────────┐\n│   START    │\n└──────┬──────┘\n       │\n       ▼\n┌─────────────┐\n│  Process A  │\n└──────┬──────┘\n       │\n       ▼\n   ╱────────╲\n  ╱ Decision ╲\n  ╲    ?    ╱\n   ╲────────╱\n    │      │\n   YES    NO\n    │      │\n    ▼      ▼\n┌──────┐ ┌──────┐\n│  B   │ │  C   │\n└──────┘ └──────┘',
  sequence:
    ' User      System     Database\n   │           │           │\n   │  Request  │           │\n   ├──────────►│           │\n   │           │  Query    │\n   │           ├──────────►│\n   │           │           │\n   │           │  Result   │\n   │           │◄──────────┤\n   │  Response │           │\n   │◄──────────┤           │\n   │           │           │',
  network:
    '          ┌─────────┐\n          │ Server  │\n          └────┬────┘\n               │\n     ┌─────────┼─────────┐\n     │         │         │\n┌────┴────┐ ┌──┴──┐ ┌────┴────┐\n│ Client1 │ │ DB  │ │ Client2 │\n└─────────┘ └─────┘ └─────────┘',
  hierarchy:
    '            ┌─────────┐\n            │   CEO   │\n            └────┬────┘\n       ┌─────────┼─────────┐\n       │         │         │\n   ┌───┴───┐ ┌───┴───┐ ┌───┴───┐\n   │  VP1  │ │  VP2  │ │  VP3  │\n   └───┬───┘ └───┬───┘ └───┬───┘\n       │         │         │\n   ┌───┴───┐ ┌───┴───┐ ┌───┴───┐\n   │ Team1 │ │ Team2 │ │ Team3 │\n   └───────┘ └───────┘ └───────┘',

  // ----- frames -----
  header:
    '╔════════════════════════════════════╗\n║            SECTION TITLE           ║\n╚════════════════════════════════════╝',
  note: '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n┃  NOTE:                         ┃\n┃  This is an important note     ┃\n┃  that requires attention!      ┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
  warning:
    '╔════════════════════════════════════╗\n║  ⚠️  WARNING                       ║\n║                                    ║\n║  Critical information here!        ║\n╚════════════════════════════════════╝',
  info: '╭────────────────────────────────────╮\n│  ℹ️  INFO                          │\n│                                    │\n│  Helpful information here.         │\n╰────────────────────────────────────╯',
  divider: '════════════════════════════════════════',
  separator:
    '╭──────────────────────────────────────╮\n│                                      │\n╰──────────────────────────────────────╯',
  banner:
    '★══════════════════════════════════════★\n║          YOUR TITLE HERE            ║\n★══════════════════════════════════════★',
  checklist:
    '☐ Task 1 - Not completed\n☑ Task 2 - Completed  \n☐ Task 3 - Not completed\n☐ Task 4 - Not completed',

  // ----- bars / tables (only in src/renderer.js) -----
  'progress-bar': '\nProgress:  [████████████░░░░░░░░] 60%\n           0%                    100%',
  'table-simple':
    '\n┌──────────┬──────────┬──────────┐\n│ Header 1 │ Header 2 │ Header 3 │\n├──────────┼──────────┼──────────┤\n│  Data 1  │  Data 2  │  Data 3  │\n├──────────┼──────────┼──────────┤\n│  Data 4  │  Data 5  │  Data 6  │\n└──────────┴──────────┴──────────┘',
};

function getTemplate(name) {
  if (typeof name !== 'string') return '';
  return ASCII_TEMPLATES[name] || '';
}

module.exports = { ASCII_TEMPLATES, getTemplate };
