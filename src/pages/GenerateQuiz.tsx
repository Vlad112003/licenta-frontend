// src/pages/GenerateQuiz.tsx
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
    IonProgressBar,
    IonItemDivider,
    IonBadge,
} from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useHistory } from 'react-router';
import api from '../services/api';
import './GenerateQuiz.css';

interface Question {
    id: string;
    question: string;
    correctAnswer?: string;
    studentAnswer?: string;
    score?: number;
}

// Interface matching the API response format
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

// Score response interface
interface ScoreResponse {
    question: string;
    studentAnswer: string;
    score: number;
}

enum QuizStep {
    CONTENT = 0,
    QUESTIONS = 1,
    QUIZ = 2,
    RESULTS = 3,
}

const GenerateQuiz: React.FC = () => {
    const [lessonContent, setLessonContent] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Loading...');
    const [error, setError] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<QuizStep>(QuizStep.CONTENT);
    const history = useHistory();

    const parseQuestions = (rawText: string): Question[] => {
        // First try to parse numbered questions (1., 2., etc)
        const numberedRegex = /(\d+\.\s*)(.*?)(?=\d+\.\s*|$)/gs;
        const numberedMatches = [...rawText.matchAll(numberedRegex)];

        if (numberedMatches.length > 0) {
            return numberedMatches.map((match, index) => ({
                id: `q-${index}`,
                question: match[2].trim()
            }));
        }

        // If no numbered questions found, try to split by lines or question marks
        const plainQuestions = rawText.split(/\n+/).filter(line =>
            line.trim().length > 0 && line.includes('?')
        );

        if (plainQuestions.length > 0) {
            return plainQuestions.map((question, index) => ({
                id: `q-${index}`,
                question: question.trim()
            }));
        }

        // If still no questions found, just return the whole text as one question
        return [{
            id: 'q-0',
            question: rawText.trim()
        }];
    };

    const handleGenerateQuestions = async () => {
        if (!lessonContent.trim()) {
            setError('Please enter lesson content to generate questions');
            return;
        }

        setLoading(true);
        setLoadingMessage('Generating questions...');
        setError(null);

        try {
            // Generate a random number between 5 and 10 for question count
            const questionCount = Math.floor(Math.random() * 6) + 5; // Random between 5-10

            console.log(`Requesting ${questionCount} questions from lesson content`);
            const response = await api.post('/api/questions/generate', {
                text: lessonContent,
                count: questionCount // Add question count parameter to the API request
            });
            console.log("Response received:", response);

            // Parse the response based on the structure
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                // This is the structured API response
                const apiResponse = response.data as ApiResponse;
                const contentText = apiResponse.choices[0]?.message?.content || '';

                if (contentText) {
                    const parsedQuestions = parseQuestions(contentText);

                    // Ensure we have at least 5 questions, or up to 10
                    let finalQuestions = parsedQuestions;
                    if (parsedQuestions.length > 10) {
                        // If we got more than 10, limit to 10 random ones
                        finalQuestions = shuffleArray(parsedQuestions).slice(0, 10);
                    } else if (parsedQuestions.length < 5) {
                        // If we got fewer than 5, use what we have
                        console.warn(`Only parsed ${parsedQuestions.length} questions, fewer than minimum 5`);
                        finalQuestions = parsedQuestions;
                    }

                    if (finalQuestions.length > 0) {
                        setQuestions(finalQuestions);
                        await generateAnswers(finalQuestions);
                    } else {
                        // If parsing failed, use the raw content as a single question
                        setError('Could not parse questions from response. Please try different content.');
                    }
                } else {
                    setError('No questions were generated');
                }
            } else if (typeof response.data === 'string') {
                // Fallback for direct string response
                const parsedQuestions = parseQuestions(response.data);

                // Limit to between 5-10 questions
                let finalQuestions = parsedQuestions;
                if (parsedQuestions.length > 10) {
                    finalQuestions = shuffleArray(parsedQuestions).slice(0, 10);
                }

                setQuestions(finalQuestions);
                await generateAnswers(finalQuestions);
            } else if (Array.isArray(response.data)) {
                // Fallback for array response - limit to between 5-10 questions
                let finalQuestions = response.data;
                if (finalQuestions.length > 10) {
                    finalQuestions = shuffleArray(finalQuestions).slice(0, 10);
                }

                setQuestions(finalQuestions);
                await generateAnswers(finalQuestions);
            } else {
                console.error('Unexpected response format', response.data);
                setError('Received an unexpected response format from the server');
            }
        } catch (error: unknown) {
            const err = error as { message?: string };
            console.error('Failed to generate questions:', err);
            setError('Failed to generate questions. Please try again.');
        } finally {
            setLoading(false);
            setCurrentStep(QuizStep.QUESTIONS);
        }
    };

// Helper function to shuffle an array (for random question selection)
    const shuffleArray = <T,>(array: T[]): T[] => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    };

    const generateAnswers = async (questionsToAnswer: Question[]) => {
        try {
            setLoadingMessage('Generating answers based on lesson content...');

            // Extract just the question strings for the API
            const questionTexts = questionsToAnswer.map(q => q.question);

            try {
                // Send both questions and lesson content to the API
                const response = await api.post('/api/answers/generate', {
                    questions: questionTexts,
                    lessonContent: lessonContent
                });

                let answersContent = '';
                if (typeof response.data === 'string') {
                    answersContent = response.data;
                } else if (response.data && response.data.choices && response.data.choices.length > 0) {
                    answersContent = response.data.choices[0].message.content;
                }

                console.log("Raw answers content:", answersContent);

                // Create a map of all questions for lookup
                const questionsMap = new Map<string, Question>();
                questionsToAnswer.forEach((q) => {
                    questionsMap.set(q.question, q);
                });

                // Process each question individually without relying on pattern matching
                // First separate the content by questions
                const questionAnswerPairs: {question: string, answer: string}[] = [];

                // Split by "Întrebare:" to get separate QA blocks
                const qaBlocks = answersContent.split(/Întrebare:/g).filter(block => block.trim());

                for (const block of qaBlocks) {
                    // Extract the question part (first line)
                    const lines = block.split('\n').filter(l => l.trim());
                    if (lines.length > 0) {
                        const questionText = lines[0].trim();

                        // Look for Răspuns: pattern
                        const answerIndex = lines.findIndex(l => l.includes('Răspuns:'));
                        if (answerIndex !== -1 && answerIndex + 1 < lines.length) {
                            // Get answer text (could be the line with "Răspuns:" or the next line)
                            let answerText = lines[answerIndex].replace('Răspuns:', '').trim();
                            if (!answerText && answerIndex + 1 < lines.length) {
                                answerText = lines[answerIndex + 1].trim();
                            }

                            questionAnswerPairs.push({
                                question: questionText,
                                answer: answerText || "No answer found"
                            });
                        }
                    }
                }

                console.log("Parsed question-answer pairs:", questionAnswerPairs);

                // Match answers with original questions
                const updatedQuestions = questionsToAnswer.map(q => {
                    // Try to find a match for this question
                    const bestMatch = findBestMatch(q.question, questionAnswerPairs);
                    return {
                        ...q,
                        correctAnswer: bestMatch?.answer || "No matching answer found in response",
                        studentAnswer: ''
                    };
                });

                setQuestions(updatedQuestions);
            } catch (error) {
                console.error(`Failed to get answers for questions`, error);

                // Set default values if API call fails
                const defaultAnswers = questionsToAnswer.map(q => ({
                    ...q,
                    correctAnswer: 'Failed to generate answer from content',
                    studentAnswer: ''
                }));

                setQuestions(defaultAnswers);
            }
        } catch (error) {
            console.error('Failed to process answers:', error);
            setError('Failed to generate answers for some questions.');
        }
    };

// Helper function to find the best matching answer for a question
    const findBestMatch = (question: string, pairs: {question: string, answer: string}[]) => {
        // Try exact match first
        const exactMatch = pairs.find(p => p.question === question);
        if (exactMatch) return exactMatch;

        // Try substring match (question contains or is contained in pair)
        const substringMatch = pairs.find(p =>
            p.question.toLowerCase().includes(question.toLowerCase()) ||
            question.toLowerCase().includes(p.question.toLowerCase())
        );
        if (substringMatch) return substringMatch;

        // If no match, return the first pair if available
        return pairs.length > 0 ? pairs[0] : null;
    };


    const handleStartQuiz = () => {
        setCurrentStep(QuizStep.QUIZ);
    };

    const handleStudentAnswerChange = (questionId: string, answer: string) => {
        setQuestions(prevQuestions =>
            prevQuestions.map(q =>
                q.id === questionId ? { ...q, studentAnswer: answer } : q
            )
        );
    };

    const handleSubmitQuiz = async () => {
        setLoading(true);
        setLoadingMessage('Evaluating answers...');
        setError(null);

        try {
            const payload = questions.map(q => ({
                question: q.question,
                correctAnswer: q.correctAnswer || '',
                studentAnswer: q.studentAnswer || ''
            }));

            const response = await api.post('/api/evaluation/score', payload);
            console.log("Score response:", response.data);

            // Handle the scoring response
            if (typeof response.data === 'string') {
                const scoreBlocks = response.data.split('\n\n').filter(block => block.trim());
                const updatedQuestions = [...questions];

                // Track which questions we've already scored
                const scoredQuestions = new Set<string>();

                // First pass: try to match scores with questions by exact question text
                for (const block of scoreBlocks) {
                    const questionMatch = block.match(/Întrebare:\s*(.*)/);
                    const scoreMatch = block.match(/Scor:\s*(-?\d+)/);

                    if (questionMatch && scoreMatch) {
                        const questionText = questionMatch[1].trim();
                        const score = parseInt(scoreMatch[1], 10);

                        // Find the matching question and update its score
                        const index = updatedQuestions.findIndex(q =>
                            q.question.toLowerCase() === questionText.toLowerCase()
                        );

                        if (index !== -1 && !scoredQuestions.has(updatedQuestions[index].id)) {
                            updatedQuestions[index].score = score < 0 ? 0 : score; // Fix negative scores
                            scoredQuestions.add(updatedQuestions[index].id);
                        }
                    }
                }

                // Second pass: match unscored questions by similarity
                for (let i = 0; i < updatedQuestions.length; i++) {
                    if (!scoredQuestions.has(updatedQuestions[i].id)) {
                        // Find the best matching score block
                        let bestMatchScore = 0;

                        for (const block of scoreBlocks) {
                            const questionMatch = block.match(/Întrebare:\s*(.*)/);
                            const scoreMatch = block.match(/Scor:\s*(-?\d+)/);

                            if (questionMatch && scoreMatch) {
                                const questionText = questionMatch[1].trim();
                                const score = parseInt(scoreMatch[1], 10);

                                // Check if this is a potential match
                                if (updatedQuestions[i].question.toLowerCase().includes(questionText.toLowerCase()) ||
                                    questionText.toLowerCase().includes(updatedQuestions[i].question.toLowerCase())) {
                                    bestMatchScore = score < 0 ? 0 : score; // Fix negative scores
                                    break;
                                }
                            }
                        }

                        updatedQuestions[i].score = bestMatchScore;
                    }
                }

                // Final pass: ensure all questions have a valid score
                for (const q of updatedQuestions) {
                    if (q.score === undefined || q.score < 0) {
                        q.score = 0;
                    }
                }

                setQuestions(updatedQuestions);
            } else if (Array.isArray(response.data)) {
                // Handle array response
                const scoredAnswers = response.data;
                const updatedQuestions = questions.map((q, index) => {
                    let score = 0;
                    if (index < scoredAnswers.length) {
                        const scoreInfo = scoredAnswers[index] as ScoreResponse;
                        score = scoreInfo?.score || 0;
                        if (score < 0) score = 0; // Fix negative scores
                    }

                    return {
                        ...q,
                        score: score
                    };
                });

                setQuestions(updatedQuestions);
            } else {
                // Default handling - assign zero scores
                const updatedQuestions = questions.map(q => ({
                    ...q,
                    score: 0
                }));

                setQuestions(updatedQuestions);
                setError('Could not parse evaluation results properly');
            }

            setCurrentStep(QuizStep.RESULTS);
        } catch (error) {
            console.error('Failed to evaluate quiz:', error);
            setError('Failed to evaluate quiz answers. Please try again.');

            // Still move to results but with zero scores
            const updatedQuestions = questions.map(q => ({
                ...q,
                score: 0
            }));
            setQuestions(updatedQuestions);
            setCurrentStep(QuizStep.RESULTS);
        } finally {
            setLoading(false);
        }
    };

    const handleRestartQuiz = () => {
        setLessonContent('');
        setQuestions([]);
        setError(null);
        setCurrentStep(QuizStep.CONTENT);
    };

    const renderContentStep = () => (
        <>
            <h2>Enter Lesson Content</h2>
            <p>Paste or type your lesson content below to generate questions.</p>

            <IonTextarea
                value={lessonContent}
                onIonChange={(e) => setLessonContent(e.detail.value!)}
                placeholder="Enter your lesson content here (unlimited length)..."
                autoGrow={true}
                className="lesson-textarea"
                rows={10}
            />

            <div className="generate-button-container">
                <IonButton
                    expand="block"
                    onClick={handleGenerateQuestions}
                    disabled={loading || !lessonContent.trim()}
                >
                    Generate Questions
                </IonButton>
            </div>
        </>
    );

    const renderQuestionsStep = () => (
        <>
            <h2>Generated Questions</h2>
            <p>Review the questions below before starting the quiz.</p>

            {questions.map((question, index) => (
                <IonCard key={question.id || index}>
                    <IonCardHeader>
                        <IonCardTitle>Question {index + 1}</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <p>{question.question}</p>
                    </IonCardContent>
                </IonCard>
            ))}

            <div className="generate-button-container">
                <IonButton
                    expand="block"
                    onClick={handleStartQuiz}
                    disabled={questions.length === 0}
                >
                    Start Quiz
                </IonButton>
            </div>
        </>
    );

    const renderQuizStep = () => (
        <>
            <h2>Answer the Questions</h2>
            <p>Enter your answers for each question below.</p>

            {questions.map((question, index) => (
                <IonCard key={question.id || index}>
                    <IonCardHeader>
                        <IonCardTitle>Question {index + 1}</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <p className="question-text">{question.question}</p>
                        <IonItemDivider className="answer-divider">Your Answer</IonItemDivider>
                        <IonTextarea
                            placeholder="Type your answer here..."
                            value={question.studentAnswer}
                            onIonChange={e => handleStudentAnswerChange(question.id, e.detail.value || '')}
                            className="answer-textarea"
                            rows={3}
                        />
                    </IonCardContent>
                </IonCard>
            ))}

            <div className="generate-button-container">
                <IonButton
                    expand="block"
                    onClick={handleSubmitQuiz}
                    disabled={questions.some(q => !q.studentAnswer)}
                >
                    Finish Quiz
                </IonButton>
            </div>
        </>
    );

    const renderResultsStep = () => (
        <>
            <h2>Quiz Results</h2>

            <div className="quiz-summary">
                <h3>Overall Score</h3>
                <div className="score-container">
                    <p className="overall-score">
                        {Math.round(questions.reduce((sum, q) => sum + (q.score || 0), 0) / questions.length)}%
                    </p>
                </div>
            </div>

            {questions.map((question, index) => (
                <IonCard key={question.id || index} className={question.score && question.score >= 80 ? 'high-score' : 'low-score'}>
                    <IonCardHeader>
                        <IonCardTitle className="question-title">
                            Question {index + 1}
                            <IonBadge color={question.score && question.score >= 80 ? 'success' : 'warning'} className="score-badge">
                                Score: {question.score || 0}
                            </IonBadge>
                        </IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <p className="question-text">{question.question}</p>

                        <div className="answer-section">
                            <h4>Your Answer:</h4>
                            <p className="student-answer">{question.studentAnswer}</p>
                        </div>

                        <div className="answer-section">
                            <h4>Correct Answer:</h4>
                            <p className="correct-answer">{question.correctAnswer}</p>
                        </div>
                    </IonCardContent>
                </IonCard>
            ))}

            <div className="generate-button-container">
                <IonButton
                    expand="block"
                    onClick={handleRestartQuiz}
                >
                    Start New Quiz
                </IonButton>
            </div>
        </>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case QuizStep.CONTENT:
                return renderContentStep();
            case QuizStep.QUESTIONS:
                return renderQuestionsStep();
            case QuizStep.QUIZ:
                return renderQuizStep();
            case QuizStep.RESULTS:
                return renderResultsStep();
            default:
                return renderContentStep();
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>
                        {currentStep === QuizStep.RESULTS ? 'Quiz Results' : 'Quiz Generator'}
                    </IonTitle>
                    <IonButton slot="end" fill="clear" onClick={() => history.push('/dashboard')}>
                        Back
                    </IonButton>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
                {/* Progress bar */}
                <div className="progress-container">
                    <IonProgressBar
                        value={(currentStep + 1) / 4}
                        color={currentStep === QuizStep.RESULTS ? "success" : "primary"}>
                    </IonProgressBar>
                    <div className="step-indicators">
                        <div className={`step-indicator ${currentStep >= QuizStep.CONTENT ? 'active' : ''}`}>
                            Content
                        </div>
                        <div className={`step-indicator ${currentStep >= QuizStep.QUESTIONS ? 'active' : ''}`}>
                            Questions
                        </div>
                        <div className={`step-indicator ${currentStep >= QuizStep.QUIZ ? 'active' : ''}`}>
                            Quiz
                        </div>
                        <div className={`step-indicator ${currentStep >= QuizStep.RESULTS ? 'active' : ''}`}>
                            Results
                        </div>
                    </div>
                </div>

                <IonLoading isOpen={loading} message={loadingMessage} />

                {error && (
                    <div className="error-container">
                        <IonIcon icon={alertCircleOutline} color="danger" />
                        <IonText color="danger">{error}</IonText>
                    </div>
                )}

                {renderCurrentStep()}
            </IonContent>
        </IonPage>
    );
};

export default GenerateQuiz;