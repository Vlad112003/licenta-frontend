// src/pages/GenerateQuestion.tsx
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
} from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useHistory } from 'react-router';
import api from '../services/api';
import './GenerateQuestion.css';

interface Question {
    id: string;
    question: string;
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

const GenerateQuestion: React.FC = () => {
    const [lessonContent, setLessonContent] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        setError(null);

        try {
            console.log("Sending request with text:", lessonContent);
            const response = await api.post('/api/questions/generate', {
                text: lessonContent
            });
            console.log("Response received:", response);

            // Parse the response based on the structure
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                // This is the structured API response
                const apiResponse = response.data as ApiResponse;
                const contentText = apiResponse.choices[0]?.message?.content || '';

                if (contentText) {
                    const parsedQuestions = parseQuestions(contentText);
                    if (parsedQuestions.length > 0) {
                        setQuestions(parsedQuestions);
                    } else {
                        // If parsing failed, use the raw content as a single question
                        setQuestions([{
                            id: 'q-0',
                            question: contentText.trim()
                        }]);
                    }
                } else {
                    setError('No questions were generated');
                }
            } else if (typeof response.data === 'string') {
                // Fallback for direct string response
                const parsedQuestions = parseQuestions(response.data);
                setQuestions(parsedQuestions);
            } else if (Array.isArray(response.data)) {
                // Fallback for array response
                setQuestions(response.data);
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
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Generate Questions</IonTitle>
                    <IonButton slot="end" fill="clear" onClick={() => history.push('/dashboard')}>
                        Back
                    </IonButton>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
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

                <IonLoading isOpen={loading} message="Generating questions..." />

                {error && (
                    <div className="error-container">
                        <IonIcon icon={alertCircleOutline} color="danger" />
                        <IonText color="danger">{error}</IonText>
                    </div>
                )}

                {questions.length > 0 && (
                    <div className="questions-container">
                        <h2>Generated Questions</h2>
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
                    </div>
                )}
            </IonContent>
        </IonPage>
    );
};

export default GenerateQuestion;