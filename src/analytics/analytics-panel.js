/**
 * Writing Analytics Panel — modal overlay displaying analytics dashboard
 */

const { analyze } = require('./writing-analytics');

function showAnalyticsModal(tabManager) {
    const existing = document.getElementById('analytics-modal');
    if (existing) existing.remove();

    const content = tabManager.getEditorContent();
    const metrics = analyze(content);

    const overlay = document.createElement('div');
    overlay.id = 'analytics-modal';
    overlay.className = 'analytics-overlay';

    const maxCount = metrics.topWords.length > 0 ? metrics.topWords[0].count : 1;

    overlay.innerHTML = `
        <div class="analytics-modal">
            <div class="analytics-header">
                <h2>Writing Analytics</h2>
                <button class="analytics-close" title="Close">&times;</button>
            </div>
            <div class="analytics-body">
                <div class="analytics-section">
                    <h3>Readability</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Flesch Reading Ease</span>
                        <span class="analytics-value">${metrics.fleschEase}<small>${metrics.readabilityLabel}</small></span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Grade Level</span>
                        <span class="analytics-value">${metrics.fleschGrade}</span>
                    </div>
                    <div class="readability-meter">
                        <div class="readability-fill" style="width: ${Math.max(0, Math.min(100, metrics.fleschEase))}%"></div>
                    </div>
                </div>

                <div class="analytics-section">
                    <h3>Timing</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Reading Time</span>
                        <span class="analytics-value">~${metrics.readingTime} min</span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Speaking Time</span>
                        <span class="analytics-value">~${metrics.speakingTime} min</span>
                    </div>
                </div>

                <div class="analytics-section">
                    <h3>Structure</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Sentences</span>
                        <span class="analytics-value">${metrics.sentenceCount} &bull; Paragraphs: ${metrics.paragraphCount}</span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Avg Sentence</span>
                        <span class="analytics-value">${metrics.avgSentenceLength} words</span>
                    </div>
                    ${metrics.longestSentenceLength > 0 ? `
                    <div class="analytics-row analytics-longest">
                        <span class="analytics-label">Longest (${metrics.longestSentenceLength} words)</span>
                        <span class="analytics-value analytics-sentence-preview">${escapeHtml(metrics.longestSentence)}</span>
                    </div>` : ''}
                </div>

                <div class="analytics-section">
                    <h3>Vocabulary</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Unique</span>
                        <span class="analytics-value">${metrics.uniqueWordCount} / ${metrics.wordCount}<small>${metrics.lexicalDiversity}%</small></span>
                    </div>
                    ${metrics.topWords.length > 0 ? `
                    <div class="word-cloud">
                        ${metrics.topWords.map(w => {
                            const scale = 13 + Math.round((w.count / maxCount) * 3);
                            return `<span class="word-tag" style="font-size:${scale}px">${escapeHtml(w.word)}<small>${w.count}</small></span>`;
                        }).join('')}
                    </div>` : ''}
                </div>
            </div>
        </div>
    `;

    const closeBtn = overlay.querySelector('.analytics-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

module.exports = { showAnalyticsModal };
