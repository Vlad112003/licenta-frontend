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
    IonList
} from '@ionic/react';
import { alertCircleOutline, documentAttachOutline, downloadOutline } from 'ionicons/icons';
import { useState, useRef, useMemo } from 'react';
import { useHistory } from 'react-router';
import api from '../services/api';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Option {
    id: string;
    text: string;
    isCorrect: boolean;
}

interface QuizQuestion {
    id: string;
    question: string;
    options: Option[];
    explanation?: string;
}

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

const GenerateGridQuiz: React.FC = () => {
    const [lessonContent, setLessonContent] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizScore, setQuizScore] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const textAreaRef = useRef<HTMLIonTextareaElement>(null);
    const history = useHistory();

    // Memoized shuffled options for questions
    const shuffledOptions = useMemo(() => {
        const map: Record<string, Option[]> = {};
        quizQuestions.forEach(q => {
            // Shuffle only once per quiz generation
            map[q.id] = shuffleArray([...q.options]);
        });
        return map;
    }, [quizQuestions]);

    const parseQuizQuestions = (rawText: string): QuizQuestion[] => {
        try {
            // Try to parse as JSON first
            try {
                const jsonData = JSON.parse(rawText);
                if (Array.isArray(jsonData) && jsonData.length > 0 && 'question' in jsonData[0]) {
                    return jsonData.map((item, index) => ({
                        ...item,
                        id: item.id || `q-${index}`
                    }));
                }
            } catch {
                // Not JSON, continue with text parsing
                console.log('Response is not valid JSON, parsing as text');
            }

            const questions: QuizQuestion[] = [];

            // Parse multiple choice questions
            const mcSections = rawText.match(/(?:Multiple Choice Questions?|Intrebari cu alegere multipla|Grid quiz)([\s\S]*?)(?:$)/gi);
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

                    // Try to find correct answer marker
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
                            const isCorrectInText = optionText.includes('(correct)') || optionText.includes('(corect)');
                            if (isCorrectInText) {
                                optionText = optionText.replace(/\((correct|corect)\)/i, '').trim();
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

                    // Ensure only one option is marked correct (single-answer only)
                    if (options.filter(o => o.isCorrect).length > 1) {
                        const correctOptions = options.filter(o => o.isCorrect);
                        // Keep only the first correct option
                        for (let i = 1; i < correctOptions.length; i++) {
                            const index = options.findIndex(o => o.id === correctOptions[i].id);
                            if (index !== -1) {
                                options[index].isCorrect = false;
                            }
                        }
                    }

                    if (options.length > 1) {
                        questions.push({
                            id: `mc-${index}`,
                            question: questionText,
                            options,
                            explanation: explanation
                        });
                    }
                });
            }

            return questions;
        } catch (error) {
            console.error('Error parsing quiz questions:', error);
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
        setSelectedAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);

        try {
            // Normalize the text
            let normalizedText = lessonContent.replace(/\r\n/g, '\n');
            normalizedText = normalizedText.replace(/\n{2,}/g, "\n\n");

            const apiPrompt = `Generate a multiple-choice quiz with exactly 20 questions based strictly on the following text, in romanian.

Format the quiz in plain text, not JSON. Follow this structure exactly:

Multiple Choice Questions:
Question 1: [question text]
A) [option text]
B) [option text]
C) [option text]
D) [option text]
✅ Answer corect: [correct letter]

Requirements:
- The quiz must include ONLY single-answer questions (exactly one correct option per question).
- DO NOT label answers with "(correct)" in the options.
- Provide a brief explanation (1-2 sentences) in romanian after each answer that focuses on why the correct answer is right.
- Ensure all questions are directly based on the input text.
- Avoid repetition or irrelevant questions.
- MAKE SURE THE ANSWERS LABELED AS CORRECT ARE ACTUALLY CORRECT AND THEY CORRESPOND WITH THE GIVEN EXPLANATION.
TEXT:
${normalizedText}`;

            console.log('Sending content to API for quiz generation');

            const response = await api.post('/api/questions/generate', {
                text: apiPrompt
            });

            console.log('Received API response for quiz');

            if (response.data && response.data.choices?.length > 0) {
                const apiResponse = response.data as ApiResponse;
                const contentText = apiResponse.choices[0]?.message?.content || '';
                console.log('Content from API:', contentText);

                const parsed = parseQuizQuestions(contentText);

                if (parsed.length > 0) {
                    setQuizQuestions(parsed);
                } else {
                    setError('Could not generate quiz questions from the content. Try with different text.');
                }
            } else if (typeof response.data === 'string') {
                console.log('Response is string');
                const parsed = parseQuizQuestions(response.data);

                if (parsed.length > 0) {
                    setQuizQuestions(parsed);
                } else {
                    setError('Could not generate quiz questions from the content. Try with different text.');
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

    const handleAnswerSelect = (questionId: string, optionId: string) => {
        setSelectedAnswers(prev => ({
            ...prev,
            [questionId]: optionId
        }));
    };

    const handleSubmitQuiz = () => {
        if (quizQuestions.length === 0) return;

        let correctAnswers = 0;
        let totalQuestions = quizQuestions.length;

        quizQuestions.forEach(question => {
            const selectedOptionId = selectedAnswers[question.id];
            if (selectedOptionId) {
                const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption?.isCorrect) {
                    correctAnswers++;
                }
            }
        });

        const score = (correctAnswers / totalQuestions) * 100;
        setQuizScore(score);
        setQuizSubmitted(true);
    };

    const resetQuiz = () => {
        setSelectedAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
    };

    // Function to reset quiz and generate a new one
    const handleGenerateAnotherQuiz = () => {
        setLessonContent('');
        setQuizQuestions([]);
        setSelectedAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
        setFileName(null);
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
            let textContent = "MULTIPLE CHOICE QUIZ\n\n";

            quizQuestions.forEach((q, i) => {
                textContent += `Question ${i + 1}: ${q.question}\n`;

                // Use the shuffled options for export
                const shuffledOpts = shuffledOptions[q.id] || q.options;
                shuffledOpts.forEach((opt, index) => {
                    const optionLetter = String.fromCharCode(65 + index);
                    textContent += `${optionLetter}) ${opt.text}\n`;
                });

                // Add answer key line with correct letter based on shuffled positions
                const correctLetter = shuffledOpts
                    .map((opt, index) => opt.isCorrect ? String.fromCharCode(65 + index) : null)
                    .filter(letter => letter !== null)[0];
                
                textContent += `✅ Correct answer: ${correctLetter}\n`;
                
                // Add explanation if available
                if (q.explanation) {
                    textContent += `\nExplanation: ${q.explanation}\n`;
                }
                
                textContent += '\n';
            });

            // Create blob and file
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and click it to download
            const link = document.createElement('a');
            link.href = url;
            link.download = 'grid_quiz.txt';
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
        let total = quizQuestions.length;

        quizQuestions.forEach(question => {
            if (selectedAnswers[question.id]) {
                answered++;
            }
        });

        return { answered, total };
    };

    const { answered, total } = calculateAnsweredQuestions();

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Generate Grid Quiz</IonTitle>
                    <IonButton slot="end" fill="clear" onClick={() => history.push('/dashboard')}>
                        Back
                    </IonButton>
                </IonToolbar>
            </IonHeader>

            <IonContent className="ion-padding">
                <h2>Create a Grid Quiz</h2>
                <p>Upload content or enter text to generate single-answer multiple choice questions.</p>

                {quizQuestions.length === 0 && (
                    <>
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
                                Generate Grid Quiz
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
                        <h2>Grid Quiz</h2>

                        {!quizSubmitted && (
                            <div className="quiz-stats">
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
                                            {quizQuestions.map((question, index) => {
                                                const selectedOptionId = selectedAnswers[question.id];
                                                const isCorrect = question.options.find(opt => opt.id === selectedOptionId)?.isCorrect || false;
                                                
                                                return (
                                                    <IonCard key={question.id} className="question-review-card">
                                                        <div className="mc-question-review">
                                                            <h4 className="question-text">{index + 1}. {question.question}</h4>
                                                            <div className="options-review">
                                                                {(shuffledOptions[question.id] || question.options).map((option, optIndex) => (
                                                                    <p key={option.id} className={
                                                                        option.isCorrect ? "correct-option" : 
                                                                        option.id === selectedOptionId && !option.isCorrect ? "incorrect-selected-option" : ""
                                                                    }>
                                                                        {String.fromCharCode(65 + optIndex)}. {option.text} 
                                                                        {option.isCorrect && " ✓"}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                            <div className="answer-comparison">
                                                                <p className={isCorrect ? "correct-answer" : "incorrect-answer"}>
                                                                    Your answer: {
                                                                        selectedOptionId ? 
                                                                        question.options.find(o => o.id === selectedOptionId)?.text || 'Not answered' :
                                                                        'Not answered'
                                                                    }
                                                                </p>
                                                                <p className="actual-answer">Correct answer: {
                                                                    question.options.find(o => o.isCorrect)?.text || 'Unknown'
                                                                }</p>
                                                                
                                                                {question.explanation && (
                                                                    <div className="answer-explanation">
                                                                        <p><strong>Explanation:</strong> {question.explanation}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </IonCard>
                                                )
                                            })}
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
                                {quizQuestions.map((question, index) => (
                                    <IonCard key={question.id}>
                                        <IonCardContent>
                                            <p className="question-text">{index + 1}. {question.question}</p>
                                            <IonRadioGroup
                                                value={selectedAnswers[question.id] || ''}
                                                onIonChange={e => handleAnswerSelect(question.id, e.detail.value)}
                                            >
                                                {(shuffledOptions[question.id] || question.options).map((option, optIndex) => (
                                                    <IonItem key={option.id} lines="none">
                                                        <IonLabel>{String.fromCharCode(65 + optIndex)}. {option.text}</IonLabel>
                                                        <IonRadio slot="start" value={option.id} />
                                                    </IonItem>
                                                ))}
                                            </IonRadioGroup>
                                        </IonCardContent>
                                    </IonCard>
                                ))}

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

                .textarea-drop-zone {
                    position: relative;
                    margin-bottom: 16px;
                    border: 2px dashed var(--ion-color-medium);
                    border-radius: 10px;
                }
                
                .textarea-drop-zone.dragging {
                    border-color: var(--ion-color-primary);
                    background-color: rgba(var(--ion-color-primary-rgb), 0.1);
                }
                
                .drop-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background-color: rgba(var(--ion-color-primary-rgb), 0.2);
                    border-radius: 8px;
                    z-index: 10;
                }
                
                .drop-overlay ion-icon {
                    font-size: 3rem;
                    color: var(--ion-color-primary);
                    margin-bottom: 10px;
                }
                
                .file-info {
                    margin-top: 10px;
                    padding: 10px;
                    background-color: var(--ion-color-light);
                    border-radius: 8px;
                }
                
                .quiz-stats {
                    text-align: center;
                    margin-bottom: 16px;
                    padding: 8px;
                    background-color: var(--ion-color-light);
                    border-radius: 8px;
                }
                
                .generate-button-container {
                    margin: 20px 0;
                }
                
                .error-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 16px;
                    background-color: rgba(var(--ion-color-danger-rgb), 0.1);
                    border-radius: 8px;
                    margin: 16px 0;
                }
            `}</style>
        </IonPage>
    );
};

export default GenerateGridQuiz;
