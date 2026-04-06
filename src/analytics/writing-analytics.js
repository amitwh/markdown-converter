/**
 * Writing Analytics — pure computation engine
 * No DOM dependencies. Exported analyze(text) returns a metrics object.
 */

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'and', 'or', 'but', 'if', 'it',
    'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
    'they', 'them', 'their', 'not', 'no', 'so', 'than', 'too',
    'very', 'also', 'just', 'about', 'up', 'out', 'what', 'which', 'who'
]);

function countSyllables(word) {
    word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    return word.match(/[aeiouy]{1,2}/gi)?.length || 1;
}

function extractWords(text) {
    return text.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || [];
}

function getReadabilityLabel(score) {
    if (score >= 90) return 'Very Easy';
    if (score >= 70) return 'Easy';
    if (score >= 50) return 'Standard';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
}

function analyze(text) {
    if (!text || !text.trim()) {
        return {
            wordCount: 0,
            sentenceCount: 0,
            paragraphCount: 0,
            fleschEase: 0,
            fleschGrade: 0,
            readabilityLabel: 'N/A',
            readingTime: 0,
            speakingTime: 0,
            uniqueWordCount: 0,
            lexicalDiversity: 0,
            avgSentenceLength: 0,
            longestSentence: '',
            longestSentenceLength: 0,
            topWords: []
        };
    }

    const words = extractWords(text);
    const wordCount = words.length;

    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const sentenceCount = Math.max(sentences.length, 1);

    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const paragraphCount = Math.max(paragraphs.length, 1);

    let totalSyllables = 0;
    for (const w of words) {
        totalSyllables += countSyllables(w);
    }

    const fleschEase = Math.round((206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (totalSyllables / wordCount)) * 10) / 10;
    const fleschGrade = Math.round((0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59) * 10) / 10;
    const readabilityLabel = getReadabilityLabel(fleschEase);

    const readingTime = Math.ceil(wordCount / 200);
    const speakingTime = Math.ceil(wordCount / 130);

    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const uniqueWordCount = uniqueWords.size;
    const lexicalDiversity = wordCount > 0 ? Math.round((uniqueWordCount / wordCount) * 1000) / 10 : 0;

    const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

    let longestSentence = '';
    let longestSentenceLength = 0;
    for (const s of sentences) {
        const sWords = extractWords(s);
        if (sWords.length > longestSentenceLength) {
            longestSentenceLength = sWords.length;
            longestSentence = s.trim();
        }
    }

    if (longestSentence.length > 80) {
        longestSentence = longestSentence.substring(0, 80) + '...';
    }

    const wordFreq = {};
    for (const w of words) {
        const lower = w.toLowerCase();
        if (!STOP_WORDS.has(lower) && lower.length > 1) {
            wordFreq[lower] = (wordFreq[lower] || 0) + 1;
        }
    }

    const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

    return {
        wordCount,
        sentenceCount,
        paragraphCount,
        fleschEase,
        fleschGrade,
        readabilityLabel,
        readingTime,
        speakingTime,
        uniqueWordCount,
        lexicalDiversity,
        avgSentenceLength,
        longestSentence,
        longestSentenceLength,
        topWords
    };
}

module.exports = { analyze };
