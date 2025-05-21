import {
    IonButton,
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonTextarea,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonLoading,
    IonText,
    IonIcon,
    IonToast,
    IonRadioGroup,
    IonRadio,
    IonLabel,
    IonItem,
    IonList,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonSegment,
    IonSegmentButton,
} from '@ionic/react';
import { alertCircleOutline, documentAttachOutline, downloadOutline } from 'ionicons/icons';
import { useState, useRef, useMemo } from 'react';
import { useHistory } from 'react-router';
import api from '../services/api';
// import './GenerateObjectiveQuiz.css';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Interface for true/false questions
interface TrueFalseQuestion {
    id: string;
    type: 'truefalse';
    question: string;
    correct: boolean;
}

// Interface for matching questions
interface MatchingItem {
    id: string;
    left: string;
    right: string;
}

interface MatchingQuestion {
    id: string;
    type: 'matching';
    title: string;
    items: MatchingItem[];
}

// Interface for multiple choice questions
interface Option {
    id: string;
    text: string;
    isCorrect: boolean;
}

interface MultipleChoiceQuestion {
    id: string;
    type: 'multiplechoice';
    question: string;
    options: Option[];
    explanation?: string; // Added explanation field
}

// Interface for fill-in-the-blank questions
interface FillInBlankQuestion {
    id: string;
    type: 'fillblank';
    prompt: string;
    answer: string;
}

// Union type for all question types
type ObjectiveQuestion = TrueFalseQuestion | MatchingQuestion | MultipleChoiceQuestion | FillInBlankQuestion;

interface ApiResponse {
    id: string;
    provider: string;
    model: string;
    object: string;
    created: number;
    choices: {
        logprobs: null;
        finish_reason: string;
        native_finish_reason: string;
        index: number;
        message: {
            role: string;
            content: string;
            refusal: null;
            reasoning: null;
        };
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface ErrorWithMessage {
    message: string;
    [key: string]: unknown;
}

// Utility function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Utility function to remove diacritics and normalize string for comparison
function normalizeAnswer(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/ș/g, 's').replace(/ț/g, 't').replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
        .replace(/Ş/g, 'S').replace(/Ţ/g, 'T').replace(/Ă/g, 'A').replace(/Â/g, 'A').replace(/Î/g, 'I')
        .toLowerCase()
        .trim();
}

const GenerateObjectiveQuiz: React.FC = () => {
    const [lessonContent, setLessonContent] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<ObjectiveQuestion[]>([]);
    const [quizType, setQuizType] = useState<'mixed' | 'truefalse' | 'matching' | 'multiplechoice' | 'fillblank'>('mixed');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizScore, setQuizScore] = useState<number | null>(null);

    // Answer state
    const [trueFalseAnswers, setTrueFalseAnswers] = useState<Record<string, boolean>>({});
    const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
    const [multipleChoiceAnswers, setMultipleChoiceAnswers] = useState<Record<string, string[]>>({});
    const [fillBlankAnswers, setFillBlankAnswers] = useState<Record<string, string>>({});

    const textAreaRef = useRef<HTMLIonTextareaElement>(null);
    const history = useHistory();

    // Memoized shuffled options for multiple choice questions
    const shuffledMultipleChoiceOptions = useMemo(() => {
        const map: Record<string, Option[]> = {};
        quizQuestions.forEach(q => {
            if (q.type === 'multiplechoice') {
                // Shuffle only once per quiz generation
                map[q.id] = shuffleArray([...q.options]);
            }
        });
        return map;
    }, [quizQuestions]);

    // Memoized shuffled right items for each matching question
    const shuffledMatchingRightItems = useMemo(() => {
        const map: Record<string, string[]> = {};
        quizQuestions.forEach(q => {
            if (q.type === 'matching') {
                // Shuffle only once per quiz generation
                map[q.id] = shuffleArray(q.items.map(item => item.right));
            }
        });
        return map;
        // Regenerate only when quizQuestions changes
    }, [quizQuestions]);

    // Parse different types of questions from API response
    const parseObjectiveQuestions = (rawText: string): ObjectiveQuestion[] => {
        try {
            // Try to parse as JSON first
            try {
                const jsonData = JSON.parse(rawText);
                if (Array.isArray(jsonData) && jsonData.length > 0 && 'type' in jsonData[0]) {
                    return jsonData as ObjectiveQuestion[];
                }
            } catch {
                // Not JSON, continue with text parsing
                console.log('Response is not valid JSON, parsing as text');
            }

            const questions: ObjectiveQuestion[] = [];

            // Parse true/false questions
            const tfSections = rawText.match(/(?:True\/False Questions?|Itemi cu alegere duală)([\s\S]*?)(?=(?:Multiple Choice Questions?|Matching Questions?|Itemi de tip pereche|Itemi cu alegere multiplă|Fill[\s-]?in[\s-]?the[\s-]?Blank|Completati cu un cuvant|Completare cu un cuvânt)|$)/gi);
            if (tfSections && tfSections.length > 0) {
                // Improved regex: match lines ending with ' - True' or ' - False' (or localized)
                const tfQuestions = tfSections[0].match(/^\d+[.)]\s*([\s\S]*?)(?:\s*[-–—]\s*)(True|False|Adevărat|Fals)\s*$/gim);
                if (tfQuestions) {
                    tfQuestions.forEach((q, index) => {
                        // Extract question and answer using regex
                        const match = q.match(/^\d+[.)]\s*([\s\S]*?)(?:\s*[-–—]\s*)(True|False|Adevărat|Fals)\s*$/i);
                        if (match) {
                            const questionText = match[1].replace(/\s+$/, '');
                            const answerText = match[2].trim().toLowerCase();
                            const isCorrect = answerText === 'true' || answerText === 'adevărat';

                            questions.push({
                                id: `tf-${index}`,
                                type: 'truefalse',
                                question: questionText,
                                correct: isCorrect
                            });
                        }
                    });
                }
            }

            // Parse matching questions
            const matchingSections = rawText.match(/(?:Matching Questions?|Itemi de tip pereche)([\s\S]*?)(?=(?:True\/False Questions?|Multiple Choice Questions?|Itemi cu alegere duală|Itemi cu alegere multiplă|Fill[\s-]?in[\s-]?the[\s-]?Blank|Completati cu un cuvant|Completare cu un cuvânt)|$)/gi);
            if (matchingSections && matchingSections.length > 0) {
                const matchingBlocks = matchingSections[0].split(/(?:Matching set|Set de potrivire)\s*\d+:/gi).filter(block => block.trim());

                matchingBlocks.forEach((block, setIndex) => {
                    const lines = block.split('\n').filter(line => line.trim());
                    const title = lines[0]?.trim() || `Matching Set ${setIndex + 1}`;

                    // Extract left items (A, B, C, D)
                    const leftItems: {letter: string; text: string}[] = [];
                    // Extract right items (1, 2, 3, 4)
                    const rightItems: {number: string; text: string}[] = [];

                    // Find answer key if present
                    let answerKey: Record<string, string> = {};

                    // Try to find the answer key in the text
                    const answerKeyMatch = block.match(/Answer Key:?\s*([A-D]=\d+,?\s*)+/i);
                    if (answerKeyMatch) {
                        const keyPairs = answerKeyMatch[0].match(/([A-D])=(\d+)/g);
                        if (keyPairs) {
                            keyPairs.forEach(pair => {
                                const [letter, number] = pair.split('=');
                                answerKey[letter] = number;
                            });
                        }
                    }

                    // Extract left items
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const letterMatch = line.match(/^([A-D])[.)]\s*(.*)/);
                        if (letterMatch) {
                            leftItems.push({
                                letter: letterMatch[1],
                                text: letterMatch[2].trim()
                            });
                        }
                    }

                    // Extract right items
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const numberMatch = line.match(/^(\d+)[.)]\s*(.*)/);
                        if (numberMatch) {
                            rightItems.push({
                                number: numberMatch[1],
                                text: numberMatch[2].trim()
                            });
                        }
                    }

                    // If we have both left and right items
                    if (leftItems.length > 0 && rightItems.length > 0) {
                        const pairs: MatchingItem[] = [];

                        // If we have an answer key, use it
                        if (Object.keys(answerKey).length > 0) {
                            leftItems.forEach(leftItem => {
                                const rightIndex = Number(answerKey[leftItem.letter]) - 1;
                                if (rightIndex >= 0 && rightIndex < rightItems.length) {
                                    pairs.push({
                                        id: `item-${leftItem.letter}`,
                                        left: leftItem.text,
                                        right: rightItems[rightIndex].text
                                    });
                                }
                            });
                        } else {
                            // No answer key, use another approach to match items
                            // Look for matches like "A. Item - C" which indicates A matches with option C
                            const pairIndications: Record<string, string> = {};

                            for (let i = 0; i < leftItems.length; i++) {
                                const leftItem = leftItems[i];
                                // Look for indication in the text like "- C" at the end
                                const indicationMatch = leftItem.text.match(/\s*-\s*([A-D])$/);
                                if (indicationMatch) {
                                    // Clean the text
                                    leftItem.text = leftItem.text.replace(/\s*-\s*[A-D]$/, '');
                                    // Store the indication
                                    pairIndications[leftItem.letter] = indicationMatch[1];
                                }
                            }

                            // If we have pair indications, use them
                            if (Object.keys(pairIndications).length > 0) {
                                leftItems.forEach(leftItem => {
                                    // Find which right item is indicated for this left item
                                    const rightItemLetter = pairIndications[leftItem.letter];
                                    if (rightItemLetter) {
                                        // Find the right item with this letter
                                        const rightItemIndex = leftItems.findIndex(item => item.letter === rightItemLetter);
                                        if (rightItemIndex >= 0 && rightItemIndex < rightItems.length) {
                                            pairs.push({
                                                id: `item-${leftItem.letter}`,
                                                left: leftItem.text,
                                                right: rightItems[rightItemIndex].text
                                            });
                                        }
                                    }
                                });
                            } else {
                                // No indications, just match in order (this is likely wrong but a fallback)
                                const limit = Math.min(leftItems.length, rightItems.length);
                                for (let i = 0; i < limit; i++) {
                                    pairs.push({
                                        id: `item-${leftItems[i].letter}`,
                                        left: leftItems[i].text,
                                        right: rightItems[i].text
                                    });
                                }
                            }
                        }

                        // If we have pairs, add the matching question
                        if (pairs.length > 0) {
                            questions.push({
                                id: `matching-${setIndex}`,
                                type: 'matching',
                                title,
                                items: pairs
                            });
                        }
                    }
                });
            }

            // Parse multiple choice questions
            const mcSections = rawText.match(/(?:Multiple Choice Questions?|Itemi cu alegere multiplă)([\s\S]*?)(?=(?:True\/False Questions?|Matching Questions?|Itemi cu alegere duală|Itemi de tip pereche|Fill[\s-]?in[\s-]?the[\s-]?Blank|Completati cu un cuvant|Completare cu un cuvânt)|$)/gi);
            if (mcSections && mcSections.length > 0) {
                const mcBlocks = mcSections[0].split(/(?:Question\s*\d+:|Q\d+:|Întrebarea\s*\d+:)/gi)
                    .filter(block => block.trim().length > 10);

                mcBlocks.forEach((block, index) => {
                    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);

                    if (lines.length < 3) return; // Need at least a question and 2 options

                    const questionText = lines[0].replace(/^\d+[.)]\s*/, '');

                    // Parse options (A, B, C, D format or 1, 2, 3, 4)
                    const optionRegex = /^([A-D]|\d+)[.:)]\s*(.+)$/i;
                    const options: Option[] = [];

                    // Try to find correct answer marker - improved to handle the specific "✅ Answer corect:" format
                    let correctAnswerLine = '';
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(/✅\s*Answer\s*corect:|Correct answer(?:\(s\))?:/i)) {
                            correctAnswerLine = lines[i];
                            break;
                        }
                    }

                    const correctIndices: string[] = [];
                    let explanation = '';

                    if (correctAnswerLine) {
                        // Extract letters after "Answer corect:" or similar patterns
                        const letterPattern = /(?:✅\s*Answer\s*corect:|Correct answer(?:\(s\))?:)\s*([A-D](?:\s*,\s*[A-D])*)/i;
                        const letterMatch = correctAnswerLine.match(letterPattern);
                        
                        if (letterMatch && letterMatch[1]) {
                            // Split by comma and clean up each letter
                            const letters = letterMatch[1].split(',').map(l => l.trim().toUpperCase());
                            letters.forEach(letter => {
                                if (letter && !correctIndices.includes(letter)) {
                                    correctIndices.push(letter);
                                }
                            });
                        }
                    }

                    // Look for an explanation after "Answer corect:" or similar patterns
                    const explanationRegex = /(?:✅\s*Answer\s*corect:.*?|Correct answer(?:\(s\))?:.*?)(?:\n|$)((?:(?!\n\s*Question\s*\d+:)[\s\S])*)/i;
                    const explanationMatch = block.match(explanationRegex);
                    
                    if (explanationMatch && explanationMatch[1]) {
                        explanation = explanationMatch[1].trim();
                        
                        // Remove placeholder texts from explanation
                        explanation = explanation
                            .replace(/\[?Detailed explanation of why this is the correct answer and why other options are incorrect\]?/gi, '')
                            .replace(/\[?Brief explanation of the correct answer\]?/gi, '')
                            .replace(/\[?Explicație: \]?/gi, '')
                            .trim();
                    }

                    // Parse options
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i];
                        // Skip the line if it's the correct answer line or part of explanation
                        if (line === correctAnswerLine || line.match(/✅\s*Answer\s*corect:|Correct answer(?:\(s\))?:/i)) {
                            continue;
                        }
                        
                        const match = line.match(optionRegex);

                        if (match) {
                            const optionLetter = match[1].toUpperCase();
                            let optionText = match[2].trim();

                            // Check if this option is marked as correct in the text
                            const isCorrectInText = optionText.includes('(correct)');
                            if (isCorrectInText) {
                                optionText = optionText.replace(/\(correct\)/i, '').trim();
                                if (!correctIndices.includes(optionLetter)) {
                                    correctIndices.push(optionLetter);
                                }
                            }

                            options.push({
                                id: `option-${optionLetter}`,
                                text: optionText,
                                isCorrect: correctIndices.includes(optionLetter) || isCorrectInText
                            });
                        }
                    }

                    // Ensure at least one option is marked correct if none found
                    if (options.length > 0 && !options.some(o => o.isCorrect)) {
                        options[0].isCorrect = true;
                    }

                    if (options.length > 1) {
                        questions.push({
                            id: `mc-${index}`,
                            type: 'multiplechoice',
                            question: questionText,
                            options,
                            explanation: explanation
                        });
                    }
                });
            }

            // Parse fill-in-the-blank questions
            // Section header: "Fill in the Blank" or "Completati cu un cuvant"
            const fillSections = rawText.match(/(?:Fill[\s-]?in[\s-]?the[\s-]?Blank|Completati cu un cuvant|Completare cu un cuvânt)([\s\S]*?)(?=(?:True\/False Questions?|Matching Questions?|Multiple Choice Questions?|Itemi cu alegere duală|Itemi de tip pereche|Itemi cu alegere multiplă)|$)/gi);
            if (fillSections && fillSections.length > 0) {
                // Each line: 1. [prompt with ____ or ___ or ...] (raspuns: [answer])
                const fillQuestions = fillSections[0].match(/^\d+[.)]\s*([\s\S]*?)\s*\((?:raspuns|answer): ([^)]+)\)/gim);
                if (fillQuestions) {
                    fillQuestions.forEach((q, index) => {
                        const match = q.match(/^\d+[.)]\s*([\s\S]*?)\s*\((?:raspuns|answer): ([^)]+)\)/i);
                        if (match) {
                            questions.push({
                                id: `fillblank-${index}`,
                                type: 'fillblank',
                                prompt: match[1].trim(),
                                answer: match[2].trim()
                            });
                        }
                    });
                }
            }

            return questions;
        } catch (error) {
            console.error('Error parsing objective questions:', error);
            return [];
        }
    };

    const handleGenerateQuiz = async () => {
        if (!lessonContent.trim()) {
            setError('Please enter or upload lesson content.');
            return;
        }

        setLoading(true);
        setError(null);
        setQuizQuestions([]);
        resetAnswers();
        setQuizSubmitted(false);
        setQuizScore(null);

        try {
            let normalizedText = lessonContent.replace(/\r\n/g, '\n');
            normalizedText = normalizedText.replace(/\n{2,}/g, "\n\n");

            let apiPrompt;

            if (quizType === 'truefalse') {
                apiPrompt = `Generate a quiz with at least 10 True/False questions based strictly on the following text, in the same language as the text.
Format each question as follows:
True/False Questions:
1. [question statement] - True
2. [question statement] - False

Create challenging but fair questions that are directly based on the text content.
Please output the result in plain text format, not JSON.

TEXT:
${normalizedText}`;
            } else if (quizType === 'matching') {
                apiPrompt = `Generate a matching items quiz based strictly on the following text, in the same language as the text.
Format the quiz as follows:
Matching Questions:
Matching set 1: [title or topic]
A. [term or concept]
B. [term or concept]
C. [term or concept]
D. [term or concept]

1. [definition or description that matches one of the above]
2. [definition or description that matches one of the above]
3. [definition or description that matches one of the above]
4. [definition or description that matches one of the above]

IMPORTANT: Include a clear Answer Key in this format: Answer Key: A=3, B=1, C=4, D=2 (these are just examples, use the actual correct matches).
Create at least 5 matching sets covering different topics from the text.
Please output the result in plain text format, not JSON.

TEXT:
${normalizedText}`;
            } else if (quizType === 'multiplechoice') {
                apiPrompt = `Generate a multiple-choice quiz with exactly 20 questions based strictly on the following text, in romanian.

Format the quiz in plain text, not JSON. Follow this structure exactly:

Multiple Choice Questions:
Question 1: [question text]
A) [option text]
B) [option text]
C) [option text]
D) [option text]
✅ Answer corect: [list the correct letter(s)]

Requirements:
- The quiz must include both types of questions: single-answer and multiple-answer questions.
- DO NOT label answers with "(correct)" in the options.
- Provide a brief explanation (1-2 sentences) in romanian after each answer that focuses on why the correct answer is right.
- Ensure all questions are directly based on the input text.
- Avoid repetition or irrelevant questions.
- MAKE SURE THE ANSWERS LABELED AS CORRECT ARE ACTUALLLY CORRECT AND THEY CORRESPOND WITH THE GIVEN EXPLANATION.
TEXT:
${normalizedText}`;
            }
            else if (quizType === 'fillblank') {
                apiPrompt = `Generate a fill-in-the-blank quiz with at least 8 questions based strictly on the following text, in the same language as the text.
Format each question as follows:
Fill in the Blank:
1. [prompt with a blank, e.g. "Manus inseamna in latina _________"] (raspuns: [answer])
2. [prompt with a blank, e.g. "Henry Fayol a definit șase ______ de bază ale managementului"] (raspuns: [answer])

Please output the result in plain text format, not JSON.

TEXT:
${normalizedText}`;
            } else { // mixed
                apiPrompt = `Generate a comprehensive objective quiz based strictly on the following text, in the same language as the text, including all four types of questions, placed in this exact order:

1. True/False Questions:
1. [question statement] - True
2. [question statement] - False
(Include at least 10 true/false questions)

2. Matching Questions:
Matching set 1: [title or topic]
A. [term or concept]
B. [term or concept]
C. [term or concept]
D. [term or concept]

1. [definition or description that matches one of the above]
2. [definition or description that matches one of the above]
3. [definition or description that matches one of the above]
4. [definition or description that matches one of the above]

IMPORTANT: Include a clear Answer Key in this format for each matching set: Answer Key: A=3, B=1, C=4, D=2 (these are just examples, use the actual correct matches).
(Include at least 5 matching sets)

3. Multiple Choice Questions:
Question 1: [question text]
A) [option text]
B) [option text]
C) [option text]
D) [option text]
✅ Answer corect: [list the correct letter(s)]

(Include at least 8 multiple choice questions)

4. Fill in the Blank:
1. [prompt with a blank, e.g. "Manus inseamna in latina _________"] (raspuns: [answer])
2. [prompt with a blank, e.g. "Henry Fayol a definit șase ______ de bază ale managementului"] (raspuns: [answer])
(Include at least 8 fill-in-the-blank questions)

IMPORTANT: You MUST include all four sections in your response with the correct answer keys. Make sure to format the headings exactly as shown above.
For multiple choice, include both single-answer and multiple-answer questions.
Please output the result in plain text format, not JSON.

TEXT:
${normalizedText}`;
            }

            console.log('Sending content to API for objective quiz generation');

            const response = await api.post('/api/questions/generate', {
                text: apiPrompt
            });

            console.log('Received API response for objective quiz');

            if (response.data && response.data.choices?.length > 0) {
                const apiResponse = response.data as ApiResponse;
                const contentText = apiResponse.choices[0]?.message?.content || '';
                console.log('Content from API:', contentText);

                const parsed = parseObjectiveQuestions(contentText);

                if (parsed.length > 0) {
                    setQuizQuestions(parsed);
                } else {
                    setError('Could not generate objective quiz questions from the content. Try with different text.');
                }
            } else if (typeof response.data === 'string') {
                console.log('Response is string');
                const parsed = parseObjectiveQuestions(response.data);

                if (parsed.length > 0) {
                    setQuizQuestions(parsed);
                } else {
                    setError('Could not generate objective quiz questions from the content. Try with different text.');
                }
            } else {
                console.error('Unexpected response format:', response.data);
                setError('Unexpected response format from server.');
            }
        } catch (err: unknown) {
            const error = err as ErrorWithMessage;
            console.error('Failed to generate quiz:', error);
            setError(`Failed to generate quiz: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const resetAnswers = () => {
        setTrueFalseAnswers({});
        setMatchingAnswers({});
        setMultipleChoiceAnswers({});
        setFillBlankAnswers({});
    };

    const handleTrueFalseAnswer = (questionId: string, value: boolean) => {
        setTrueFalseAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const handleMatchingAnswer = (questionId: string, itemId: string, rightAnswer: string) => {
        setMatchingAnswers(prev => ({
            ...prev,
            [`${questionId}-${itemId}`]: rightAnswer
        }));
    };

    const handleMultipleChoiceAnswer = (questionId: string, optionId: string, isChecked: boolean) => {
        setMultipleChoiceAnswers(prev => {
            const current = prev[questionId] || [];
            if (isChecked) {
                return {
                    ...prev,
                    [questionId]: [...current, optionId]
                };
            } else {
                return {
                    ...prev,
                    [questionId]: current.filter(id => id !== optionId)
                };
            }
        });
    };

    const handleFillBlankAnswer = (questionId: string, value: string) => {
        setFillBlankAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const handleSubmitQuiz = () => {
        if (quizQuestions.length === 0) return;

        let correctAnswers = 0;
        let totalQuestions = 0;

        // Check true/false answers
        quizQuestions.forEach(question => {
            if (question.type === 'truefalse') {
                totalQuestions++;
                const userAnswer = trueFalseAnswers[question.id];
                if (userAnswer === question.correct) {
                    correctAnswers++;
                }
            } else if (question.type === 'matching') {
                // Each matching item counts as one question
                question.items.forEach(item => {
                    totalQuestions++;
                    const key = `${question.id}-${item.id}`;
                    const userAnswer = matchingAnswers[key];
                    if (userAnswer === item.right) {
                        correctAnswers++;
                    }
                });
            } else if (question.type === 'multiplechoice') {
                totalQuestions++;
                const userAnswers = multipleChoiceAnswers[question.id] || [];
                const correctOptions = question.options.filter(opt => opt.isCorrect).map(opt => opt.id);

                // For multiple choice, all correct options must be selected and no incorrect ones
                if (userAnswers.length === correctOptions.length &&
                    correctOptions.every(id => userAnswers.includes(id))) {
                    correctAnswers++;
                }
            } else if (question.type === 'fillblank') {
                totalQuestions++;
                const userAnswer = normalizeAnswer(fillBlankAnswers[question.id] || '');
                const correctAnswer = normalizeAnswer(question.answer);
                if (userAnswer === correctAnswer) {
                    correctAnswers++;
                }
            }
        });

        const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
        setQuizScore(score);
        setQuizSubmitted(true);
    };

    const resetQuiz = () => {
        resetAnswers();
        setQuizSubmitted(false);
        setQuizScore(null);
    };

    // PDF and file handling functions
    const extractTextFromPdf = async (file: File): Promise<string> => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            let text = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const items = content.items as { str: string }[];
                const pageText = items.map(item => item.str).join(' ');
                text += pageText + '\n\n';
            }

            return text;
        } catch (error) {
            console.error('PDF text extraction error:', error);
            throw new Error('Failed to extract text from PDF');
        }
    };

    // Function to reset quiz and generate a new one
    const handleGenerateAnotherQuiz = () => {
        setLessonContent('');
        setQuizQuestions([]);
        resetAnswers();
        setQuizSubmitted(false);
        setQuizScore(null);
        setFileName(null);
    };

    const processFile = async (file: File) => {
        setLoading(true);
        setError(null);
        setFileName(file.name);
        const fileType = file.type;
        const fileExt = file.name.split('.').pop()?.toLowerCase();

        try {
            if (fileType === 'application/pdf' || fileExt === 'pdf') {
                try {
                    setShowToast(true);
                    const text = await extractTextFromPdf(file);
                    if (text && text.trim()) {
                        setLessonContent(text);
                    } else {
                        setError('Could not extract text from PDF. Please try a different file or paste the content manually.');
                    }
                } catch (pdfError) {
                    console.error('PDF processing error:', pdfError);
                    setError('Failed to extract text from PDF. Please copy and paste the content manually.');
                }
            } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExt === 'docx') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                setLessonContent(result.value);
            } else if (fileType === 'text/plain' || fileExt === 'txt') {
                const text = await file.text();
                setLessonContent(text);
            } else if (fileExt === 'doc') {
                setError('Fișierele .doc nu sunt suportate direct. Te rugăm să convertești în .docx.');
            } else {
                setError('Fișierul încărcat nu este suportat. Folosește PDF, DOCX sau TXT.');
            }
        } catch (err: unknown) {
            const error = err as ErrorWithMessage;
            console.error('Error processing file:', error);
            setError(`A apărut o eroare la procesarea fișierului: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Drag and drop handlers
    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);

        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            await processFile(event.dataTransfer.files[0]);
        }
    };

    const handleExportQuiz = () => {
        if (quizQuestions.length === 0) {
            setError('No quiz to export.');
            return;
        }

        try {
            let textContent = "OBJECTIVE QUIZ\n\n";

            // Group questions by type
            const trueFalseQuestions = quizQuestions.filter(q => q.type === 'truefalse');
            const matchingQuestions = quizQuestions.filter(q => q.type === 'matching');
            const multipleChoiceQuestions = quizQuestions.filter(q => q.type === 'multiplechoice');
            const fillBlankQuestions = quizQuestions.filter(q => q.type === 'fillblank') as FillInBlankQuestion[];

            if (trueFalseQuestions.length > 0) {
                textContent += "TRUE/FALSE QUESTIONS:\n";
                trueFalseQuestions.forEach((q, i) => {
                    // Use the full question text as parsed
                    textContent += `${i + 1}. ${q.question} - ${q.correct ? 'True' : 'False'}\n`;
                });
                textContent += "\n";
            }

            if (matchingQuestions.length > 0) {
                textContent += "MATCHING QUESTIONS:\n";
                matchingQuestions.forEach((q, i) => {
                    textContent += `Matching Set ${i + 1}: ${q.title}\n`;

                    // Left column
                    q.items.forEach((item, index) => {
                        textContent += `${String.fromCharCode(65 + index)}. ${item.left}\n`;
                    });
                    textContent += "\n";

                    // Right column
                    q.items.forEach((item, index) => {
                        textContent += `${index + 1}. ${item.right}\n`;
                    });
                    textContent += "\n";

                    // Answer key - generate a proper answer key based on actual item associations
                    // For each left item (A, B, C, D), find the index (1-based) of the right item it matches
                    textContent += "Answer Key: ";
                    q.items.forEach((item, index) => {
                        // Find the index of the right item in the right column
                        const rightIndex = q.items.findIndex(
                            rightItem => rightItem.right === item.right
                        );
                        textContent += `${String.fromCharCode(65 + index)}=${rightIndex + 1}, `;
                    });
                    textContent = textContent.slice(0, -2) + "\n\n";
                });
            }

            if (multipleChoiceQuestions.length > 0) {
                textContent += "MULTIPLE CHOICE QUESTIONS:\n";
                multipleChoiceQuestions.forEach((q, i) => {
                    textContent += `Question ${i + 1}: ${q.question}\n`;

                    // Use the shuffled options for export
                    const shuffledOptions = shuffledMultipleChoiceOptions[q.id] || q.options;
                    shuffledOptions.forEach((opt, index) => {
                        const optionLetter = String.fromCharCode(65 + index);
                        textContent += `${optionLetter}) ${opt.text}\n`;
                    });

                    // Add answer key line with correct letter(s) based on shuffled positions
                    const correctLetters = shuffledOptions
                        .map((opt, index) => opt.isCorrect ? String.fromCharCode(65 + index) : null)
                        .filter(letter => letter !== null)
                        .join(", ");
                    
                    textContent += `✅ Correct answer: ${correctLetters}\n`;
                    
                    // Add explanation if available
                    if (q.explanation) {
                        textContent += `\nExplanation: ${q.explanation}\n`;
                    }
                    
                    textContent += '\n';
                });
            }

            if (fillBlankQuestions.length > 0) {
                textContent += "FILL IN THE BLANK:\n";
                fillBlankQuestions.forEach((q, i) => {
                    textContent += `${i + 1}. ${q.prompt} (answer: ${q.answer})\n`;
                });
                textContent += "\n";
            }

            // Create blob and file
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and click it to download
            const link = document.createElement('a');
            link.href = url;
            link.download = 'objective_quiz.txt';
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error exporting quiz:', err);
            setError('Failed to export quiz. Please try again.');
        }
    };

    // Calculate how many questions have been answered
    const calculateAnsweredQuestions = () => {
        let answered = 0;
        let total = 0;

        quizQuestions.forEach(question => {
            if (question.type === 'truefalse') {
                total++;
                if (trueFalseAnswers[question.id] !== undefined) answered++;
            } else if (question.type === 'matching') {
                const items = question.items;
                total += items.length; // Each item is a separate question
                items.forEach(item => {
                    if (matchingAnswers[`${question.id}-${item.id}`]) answered++;
                });
            } else if (question.type === 'multiplechoice') {
                total++;
                if (multipleChoiceAnswers[question.id]?.length > 0) answered++;
            } else if (question.type === 'fillblank') {
                total++;
                if ((fillBlankAnswers[question.id] || '').trim().length > 0) answered++;
            }
        });

        return { answered, total };
    };

    // Count questions by type for display
    const countQuestionsByType = () => {
        const counts = {
            truefalse: 0,
            matching: 0,
            multiplechoice: 0,
            fillblank: 0
        };

        quizQuestions.forEach(q => {
            if (q.type === 'truefalse') counts.truefalse++;
            else if (q.type === 'matching') counts.matching++;
            else if (q.type === 'multiplechoice') counts.multiplechoice++;
            else if (q.type === 'fillblank') counts.fillblank++;
        });

        return counts;
    };

    const questionCounts = countQuestionsByType();
    const { answered, total } = calculateAnsweredQuestions();

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Generate Objective Quiz</IonTitle>
                    <IonButton slot="end" fill="clear" onClick={() => history.push('/dashboard')}>
                        Back
                    </IonButton>
                </IonToolbar>
            </IonHeader>

            <IonContent className="ion-padding">
                <h2>Create an Objective Quiz</h2>
                <p>Upload content or enter text to generate true/false, matching, multiple choice, and fill-in-the-blank questions.</p>

                {quizQuestions.length === 0 && (
                    <>
                        <div className="quiz-type-selector">
                            <IonSegment value={quizType} onIonChange={e => setQuizType(e.detail.value as any)}>
                                <IonSegmentButton value="mixed">
                                    <IonLabel>Mixed</IonLabel>
                                </IonSegmentButton>
                                <IonSegmentButton value="truefalse">
                                    <IonLabel>True/False</IonLabel>
                                </IonSegmentButton>
                                <IonSegmentButton value="matching">
                                    <IonLabel>Matching</IonLabel>
                                </IonSegmentButton>
                                <IonSegmentButton value="multiplechoice">
                                    <IonLabel>Multiple Choice</IonLabel>
                                </IonSegmentButton>
                                <IonSegmentButton value="fillblank">
                                    <IonLabel>Fill in the Blank</IonLabel>
                                </IonSegmentButton>
                            </IonSegment>
                        </div>

                        <div
                            className={`textarea-drop-zone ${isDragging ? 'dragging' : ''}`}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            <IonTextarea
                                ref={textAreaRef}
                                placeholder="Enter or drop lesson content here..."
                                value={lessonContent}
                                onIonChange={e => setLessonContent(e.detail.value || '')}
                                rows={12}
                                className="lesson-content-textarea"
                            />

                            {isDragging && (
                                <div className="drop-overlay">
                                    <IonIcon icon={documentAttachOutline} />
                                    <p>Drop your file here</p>
                                </div>
                            )}

                            {fileName && (
                                <div className="file-info">
                                    <p>File: {fileName}</p>
                                </div>
                            )}
                        </div>

                        <div className="generate-button-container">
                            <IonButton
                                expand="block"
                                onClick={handleGenerateQuiz}
                                disabled={!lessonContent.trim() || loading}
                            >
                                Generate Objective Quiz
                            </IonButton>
                        </div>
                    </>
                )}

                <IonLoading isOpen={loading} message="Generating quiz..." />

                <IonToast
                    isOpen={showToast}
                    onDidDismiss={() => setShowToast(false)}
                    message="Some PDFs may not extract well. If content looks incorrect, please paste it manually."
                    duration={5000}
                    position="top"
                    color="warning"
                />

                {error && (
                    <div className="error-container">
                        <IonIcon icon={alertCircleOutline} color="danger" />
                        <IonText color="danger">{error}</IonText>
                    </div>
                )}

                {quizQuestions.length > 0 && (
                    <div className="quiz-container">
                        <h2>Objective Quiz</h2>

                        {!quizSubmitted && (
                            <div className="quiz-stats">
                                <p>Quiz Summary: {questionCounts.truefalse} True/False, {questionCounts.matching} Matching Sets, {questionCounts.multiplechoice} Multiple Choice, {questionCounts.fillblank} Fill in the Blank</p>
                                <p>Progress: {answered} of {total} questions answered</p>
                            </div>
                        )}

                        {quizSubmitted ? (
                            <div className="quiz-results">
                                <IonCard>
                                    <IonCardHeader color="primary">
                                        <IonCardTitle>Quiz Results</IonCardTitle>
                                    </IonCardHeader>
                                    <IonCardContent>
                                        <h3 className="score-display">Your Score: {quizScore !== null ? quizScore.toFixed(1) : 0}%</h3>
                                        <div className="results-container">
                                            {quizQuestions.map(question => (
                                                <IonCard key={question.id} className="question-review-card">
                                                    {question.type === 'truefalse' && (
                                                        <div className="tf-question-review">
                                                            <h4 className="question-text">{question.question}</h4>
                                                            <div className="answer-comparison">
                                                                <p className={trueFalseAnswers[question.id] === question.correct ? "correct-answer" : "incorrect-answer"}>
                                                                    Your answer: {trueFalseAnswers[question.id] === true ? 'True' :
                                                                    trueFalseAnswers[question.id] === false ? 'False' : 'Not answered'}
                                                                </p>
                                                                <p className="actual-answer">Correct answer: {question.correct ? 'True' : 'False'}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {question.type === 'matching' && (
                                                        <div className="matching-question-review">
                                                            <h4 className="question-text">{question.title}</h4>
                                                            <div className="matching-pairs-results">
                                                                {question.items.map(item => (
                                                                    <div key={item.id} className="matching-item-review">
                                                                        <p className="matching-prompt"><strong>{item.left}</strong></p>
                                                                        <div className="answer-comparison">
                                                                            <p className={matchingAnswers[`${question.id}-${item.id}`] === item.right ? "correct-answer" : "incorrect-answer"}>
                                                                                Your answer: {matchingAnswers[`${question.id}-${item.id}`] || 'Not answered'}
                                                                            </p>
                                                                            <p className="actual-answer">Correct answer: {item.right}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {question.type === 'multiplechoice' && (
                                                        <div className="mc-question-review">
                                                            <h4 className="question-text">{question.question}</h4>
                                                            <div className="options-review">
                                                                {/* Use shuffled options for results display */}
                                                                {(shuffledMultipleChoiceOptions[question.id] || question.options).map((option, optIndex) => (
                                                                    <p key={option.id} className={
                                                                        option.isCorrect ? "correct-option" : 
                                                                        (multipleChoiceAnswers[question.id] || []).includes(option.id) ? "incorrect-selected-option" : ""
                                                                    }>
                                                                        {String.fromCharCode(65 + optIndex)}. {option.text} 
                                                                        {option.isCorrect && " ✓"}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                            <div className="answer-comparison">
                                                                <p className={
                                                                    (() => {
                                                                        const userAnswers = multipleChoiceAnswers[question.id] || [];
                                                                        const correctOptions = question.options.filter(o => o.isCorrect).map(o => o.id);
                                                                        const isCorrect = userAnswers.length === correctOptions.length &&
                                                                            correctOptions.every(id => userAnswers.includes(id));
                                                                        return isCorrect ? "correct-answer" : "incorrect-answer";
                                                                    })()
                                                                }>
                                                                    Your answers: {
                                                                    (multipleChoiceAnswers[question.id] || [])
                                                                        .map(id => {
                                                                            const option = question.options.find(o => o.id === id);
                                                                            return option ? option.text : '';
                                                                        })
                                                                        .join(', ') || 'Not answered'
                                                                    }
                                                                </p>
                                                                <p className="actual-answer">Correct answers: {
                                                                    question.options
                                                                        .filter(o => o.isCorrect)
                                                                        .map(o => o.text)
                                                                        .join(', ')
                                                                }</p>
                                                                
                                                                {question.explanation && (
                                                                    <div className="answer-explanation">
                                                                        <p><strong>Explanation:</strong> {question.explanation}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {question.type === 'fillblank' && (
                                                        <div className="fillblank-question-review">
                                                            <h4 className="question-text">{question.prompt}</h4>
                                                            <div className="answer-comparison">
                                                                <p className={
                                                                    normalizeAnswer(fillBlankAnswers[question.id] || '') === normalizeAnswer(question.answer)
                                                                        ? "correct-answer"
                                                                        : "incorrect-answer"
                                                                }>
                                                                    Your answer: {fillBlankAnswers[question.id] || 'Not answered'}
                                                                </p>
                                                                <p className="actual-answer">Correct answer: {question.answer}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </IonCard>
                                            ))}
                                        </div>
                                    </IonCardContent>
                                </IonCard>

                                <div className="action-buttons">
                                    <IonButton onClick={resetQuiz}>Try Again</IonButton>
                                    <IonButton onClick={handleGenerateAnotherQuiz}>Generate Another Quiz</IonButton>
                                    <IonButton onClick={handleExportQuiz}>
                                        <IonIcon slot="start" icon={downloadOutline} />
                                        Export Quiz
                                    </IonButton>
                                </div>
                            </div>
                        ) : (
                            <div className="quiz-questions">
                                {/* True/False Questions */}
                                {quizQuestions.filter(q => q.type === 'truefalse').length > 0 && (
                                    <div className="true-false-section">
                                        <h3>True/False Questions</h3>
                                        {quizQuestions
                                            .filter(q => q.type === 'truefalse')
                                            .map((question, index) => (
                                                <IonCard key={question.id}>
                                                    <IonCardContent>
                                                        <p className="question-text">{index + 1}. {question.question}</p>
                                                        <IonRadioGroup
                                                            value={trueFalseAnswers[question.id] === true ? 'true' :
                                                                trueFalseAnswers[question.id] === false ? 'false' : ''}
                                                            onIonChange={e => handleTrueFalseAnswer(question.id, e.detail.value === 'true')}
                                                        >
                                                            <IonItem lines="none">
                                                                <IonLabel>True</IonLabel>
                                                                <IonRadio slot="start" value="true" />
                                                            </IonItem>
                                                            <IonItem lines="none">
                                                                <IonLabel>False</IonLabel>
                                                                <IonRadio slot="start" value="false" />
                                                            </IonItem>
                                                        </IonRadioGroup>
                                                    </IonCardContent>
                                                </IonCard>
                                            ))
                                        }
                                    </div>
                                )}

                                {/* Matching Questions */}
                                {quizQuestions.filter(q => q.type === 'matching').length > 0 && (
                                    <div className="matching-section">
                                        <h3>Matching Questions</h3>
                                        {quizQuestions
                                            .filter(q => q.type === 'matching')
                                            .map((question) => (
                                                <IonCard key={question.id}>
                                                    <IonCardHeader>
                                                        <IonCardTitle>{question.title}</IonCardTitle>
                                                    </IonCardHeader>
                                                    <IonCardContent>
                                                        {/* Left column items (terms) */}
                                                        <div className="matching-pairs">
                                                            {question.items.map((item, index) => (
                                                                <div key={item.id} className="matching-pair">
                                                                    <div className="matching-left">
                                                                        <strong>{String.fromCharCode(65 + index)}.</strong> {item.left}
                                                                    </div>
                                                                    <div className="matching-right">
                                                                        <IonSelect
                                                                            placeholder="Select match"
                                                                            value={matchingAnswers[`${question.id}-${item.id}`]}
                                                                            onIonChange={e => handleMatchingAnswer(question.id, item.id, e.detail.value)}
                                                                        >
                                                                            {/* Shuffle right items for each matching question */}
                                                                            {(shuffledMatchingRightItems[question.id] || []).map((rightText, rightIndex) => (
                                                                                <IonSelectOption key={rightIndex} value={rightText}>
                                                                                    {rightIndex + 1}. {rightText}
                                                                                </IonSelectOption>
                                                                            ))}
                                                                        </IonSelect>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </IonCardContent>
                                                </IonCard>
                                            ))
                                        }
                                    </div>
                                )}

                                {/* Multiple Choice Questions */}
                                {quizQuestions.filter(q => q.type === 'multiplechoice').length > 0 && (
                                    <div className="multiple-choice-section">
                                        <h3>Multiple Choice Questions</h3>
                                        {quizQuestions
                                            .filter(q => q.type === 'multiplechoice')
                                            .map((question, index) => (
                                                <IonCard key={question.id}>
                                                    <IonCardContent>
                                                        <p className="question-text">{index + 1}. {question.question}</p>
                                                        <p className="mc-instruction">
                                                            {question.options.filter(o => o.isCorrect).length > 1 ?
                                                                'Select all that apply' : 'Select one option'}
                                                        </p>
                                                        <IonList>
                                                            {/* Use shuffled options instead of original order */}
                                                            {(shuffledMultipleChoiceOptions[question.id] || question.options).map((option, optIndex) => (
                                                                <IonItem key={option.id} lines="none">
                                                                    <IonLabel>{String.fromCharCode(65 + optIndex)}. {option.text}</IonLabel>
                                                                    <IonCheckbox
                                                                        slot="start"
                                                                        checked={(multipleChoiceAnswers[question.id] || []).includes(option.id)}
                                                                        onIonChange={e => handleMultipleChoiceAnswer(
                                                                            question.id,
                                                                            option.id,
                                                                            e.detail.checked
                                                                        )}
                                                                    />
                                                                </IonItem>
                                                            ))}
                                                        </IonList>
                                                    </IonCardContent>
                                                </IonCard>
                                            ))
                                        }
                                    </div>
                                )}

                                {/* Fill in the Blank Questions */}
                                {quizQuestions.filter(q => q.type === 'fillblank').length > 0 && (
                                    <div className="fillblank-section">
                                        <h3>Fill in the Blank</h3>
                                        {quizQuestions
                                            .filter(q => q.type === 'fillblank')
                                            .map((question, index) => (
                                                <IonCard key={question.id}>
                                                    <IonCardContent>
                                                        <p className="question-text">{index + 1}. {question.prompt}</p>
                                                        <IonItem>
                                                            <IonLabel position="stacked">Your answer</IonLabel>
                                                            <IonTextarea
                                                                value={fillBlankAnswers[question.id] || ''}
                                                                onIonChange={e => handleFillBlankAnswer(question.id, e.detail.value || '')}
                                                                rows={1}
                                                            />
                                                        </IonItem>
                                                    </IonCardContent>
                                                </IonCard>
                                            ))
                                        }
                                    </div>
                                )}

                                <div className="action-buttons">
                                    <IonButton onClick={handleSubmitQuiz} disabled={answered === 0}>
                                        Submit Quiz
                                    </IonButton>
                                    <IonButton onClick={handleExportQuiz}>
                                        <IonIcon slot="start" icon={downloadOutline} />
                                        Export Quiz
                                    </IonButton>
                                    <IonButton onClick={handleGenerateAnotherQuiz}>
                                        Generate Another Quiz
                                    </IonButton>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </IonContent>

            <style jsx>{`
                .score-display {
                    text-align: center;
                    font-size: 1.8rem;
                    margin: 20px 0;
                    color: var(--ion-color-primary);
                }

                .results-container {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .question-review-card {
                    padding: 16px;
                    margin-bottom: 8px;
                    border-left: 4px solid var(--ion-color-medium);
                }

                .question-text {
                    margin-bottom: 12px;
                    font-weight: 500;
                }

                .answer-comparison {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-left: 16px;
                }

                .correct-answer {
                    color: var(--ion-color-success);
                    font-weight: 500;
                }

                .incorrect-answer {
                    color: var(--ion-color-danger);
                    font-weight: 500;
                }

                .actual-answer {
                    color: var(--ion-color-dark);
                }

                .matching-pairs-results {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .matching-item-review {
                    padding: 8px 0;
                    border-bottom: 1px solid var(--ion-color-light-shade);
                }

                .matching-prompt {
                    margin-bottom: 8px;
                }

                .action-buttons {
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                    margin-top: 24px;
                }

                .answer-explanation {
                    margin-top: 12px;
                    padding: 10px;
                    background-color: var(--ion-color-light);
                    border-radius: 8px;
                    border-left: 4px solid var(--ion-color-primary);
                }
                
                .answer-explanation p {
                    margin: 0;
                    line-height: 1.5;
                    color: var(--ion-color-dark);
                }

                .options-review {
                    margin-bottom: 16px;
                }
                
                .correct-option {
                    color: var(--ion-color-success);
                    font-weight: 500;
                }
                
                .incorrect-selected-option {
                    color: var(--ion-color-danger);
                    text-decoration: line-through;
                }
            `}</style>
        </IonPage>
    );
};

export default GenerateObjectiveQuiz;
