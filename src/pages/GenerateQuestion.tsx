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
    IonToast
} from '@ionic/react';
import { alertCircleOutline, documentAttachOutline, downloadOutline } from 'ionicons/icons';
import { useState, useRef } from 'react';
import { useHistory } from 'react-router';
import api from '../services/api';
import './GenerateQuestion.css';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Question {
    id: string;
    question: string;
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

const GenerateQuestion: React.FC = () => {
    const [lessonContent, setLessonContent] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const textAreaRef = useRef<HTMLIonTextareaElement>(null);
    const history = useHistory();

    const parseQuestions = (rawText: string): Question[] => {
        // First try to find numbered questions (1. Question text)
        const numberedRegex = /(\d+[\.\)])\s*([^\n\d]+(?:\n(?!\d+[\.\)]).*)*)/g;
        const numberedMatches = [...rawText.matchAll(numberedRegex)];

        if (numberedMatches.length > 1) {  // At least 2 questions to be confident in the pattern
            console.log('Found numbered questions:', numberedMatches.length);
            return numberedMatches.map((match, index) => ({
                id: `q-${index}`,
                question: match[2].replace(/\n/g, ' ').trim()
            })).filter(q => q.question.length > 10);  // Minimum length to avoid fragments
        }

        // Then try to find line-based questions that might be numbered
        const lineQuestions = rawText.split(/\n+/)
            .map(line => line.trim())
            .filter(line =>
                line.length > 15 &&
                (/^\d+[\.\)]/.test(line) || /\?$/.test(line)) &&
                !line.toLowerCase().includes('questions based on') &&
                !line.toLowerCase().includes('here are some')
            )
            .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim());

        if (lineQuestions.length > 1) {  // At least 2 questions
            console.log('Found line-based questions:', lineQuestions.length);
            return lineQuestions.map((question, index) => ({
                id: `q-${index}`,
                question: question
            }));
        }

        // Then try to find questions with question marks
        const questionRegex = /([^.!?]+\?)/g;
        const questionMatches = rawText.match(questionRegex);

        if (questionMatches && questionMatches.length > 1) {  // At least 2 questions
            console.log('Found questions with question marks:', questionMatches.length);
            return questionMatches.map((question, index) => ({
                id: `q-${index}`,
                question: question.trim()
            })).filter(q => q.question.length > 10);
        }

        // Last resort: split content by lines and filter for substantial content
        const contentLines = rawText.split(/\n+/)
            .map(line => line.trim())
            .filter(line =>
                line.length > 20 &&
                !line.toLowerCase().includes('questions') &&
                !line.toLowerCase().includes('generate') &&
                !line.toLowerCase().startsWith('based on')
            );

        if (contentLines.length > 0) {
            console.log('Using content lines as questions:', contentLines.length);
            return contentLines.map((line, index) => ({
                id: `q-${index}`,
                question: line
            }));
        }

        // Fallback for when nothing else works
        console.log('No clear questions found, creating general questions about the text');
        return [{
            id: 'q-0',
            question: 'What are the main points described in this text?'
        }];
    };

    const handleGenerateQuestions = async () => {
        if (!lessonContent.trim()) {
            setError('Please enter or upload lesson content.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Normalize the text to handle multiple consecutive line breaks
            // First replace Windows line breaks with Unix ones
            let normalizedText = lessonContent.replace(/\r\n/g, '\n');

            // Then collapse multiple blank lines into a single paragraph break
            normalizedText = normalizedText.replace(/\n{2,}/g, "\n\n");

            // Use a more direct prompt for the API
            const apiPrompt = `Generate a comprehensive set of at least 10 educational questions strictly based on this text, in the same language as the text.
Make sure to cover all paragraphs and topics in the text.
Format your response as a numbered list (1., 2., etc.).
Focus on understanding key concepts, details, and comparisons between different situations described.

TEXT:
${normalizedText}`;

            console.log('Sending content to API with improved prompt');

            const response = await api.post('/api/questions/generate', {
                text: apiPrompt
            });

            console.log('Received API response');

            if (response.data && response.data.choices?.length > 0) {
                const apiResponse = response.data as ApiResponse;
                const contentText = apiResponse.choices[0]?.message?.content || '';
                console.log('Content from API:', contentText);

                const parsed = parseQuestions(contentText);
                console.log('Parsed questions:', parsed);

                if (parsed.length > 0) {
                    setQuestions(parsed);
                } else {
                    // If no questions were parsed, try to split the content directly
                    const forcedQuestions = contentText
                        .split(/\n+/)
                        .filter(line =>
                            line.trim().length > 15 &&
                            !line.toLowerCase().includes('questions based on') &&
                            !line.toLowerCase().includes('here are some') &&
                            !line.toLowerCase().startsWith('based on the text')
                        )
                        .map((line, index) => ({
                            id: `q-${index}`,
                            question: line.replace(/^\d+[\.\)]\s*/, '').trim()
                        }));

                    if (forcedQuestions.length > 0) {
                        console.log('Generated questions by direct text splitting:', forcedQuestions);
                        setQuestions(forcedQuestions);
                    } else {
                        setError('Could not parse questions from the response. Try again or modify your content.');
                    }
                }
            } else if (typeof response.data === 'string') {
                console.log('Response is string');
                const parsed = parseQuestions(response.data);

                if (parsed.length > 0) {
                    setQuestions(parsed);
                } else {
                    setError('Could not parse questions from the response. Try again or modify your content.');
                }
            } else if (Array.isArray(response.data)) {
                console.log('Response is array:', response.data);
                setQuestions(response.data);
            } else {
                console.error('Unexpected response format:', response.data);
                setError('Unexpected response format from server.');
            }
        } catch (err: unknown) {
            const error = err as ErrorWithMessage;
            console.error('Failed to generate questions:', error);
            setError(`Failed to generate questions: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Simple PDF text extraction without conversion
    const extractTextFromPdf = async (file: File): Promise<string> => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            let text = '';

            // Process each page
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();

                // Extract text in reading order
                const items = content.items as { str: string }[];
                const pageText = items
                    .map(item => item.str)
                    .join(' ');

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
                    // Show message about potential issues
                    setShowToast(true);

                    // Direct text extraction
                    const text = await extractTextFromPdf(file);
                    if (text && text.trim()) {
                        setLessonContent(text);
                    } else {
                        setError('Could not extract text from PDF. Please copy and paste the content manually.');
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
                const arrayBuffer = await file.arrayBuffer();
                const text = new TextDecoder('utf-8').decode(arrayBuffer);
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
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const handleExportQuestions = () => {
        if (questions.length === 0) {
            setError('No questions to export.');
            return;
        }

        try {
            // Create text content for the file
            const textContent = questions.map((q, index) =>
                `Question ${index + 1}: ${q.question}`
            ).join('\n\n');

            // Create blob and file
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and click it to download
            const link = document.createElement('a');
            link.href = url;
            link.download = 'generated_questions.txt';
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error exporting questions:', err);
            setError('Failed to export questions. Please try again.');
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
                <h2>Upload or Enter Lesson Content</h2>
                <p>Type your content or drag and drop a file below (PDF, DOCX, TXT).</p>

                <div
                    className={`textarea-drop-zone ${isDragging ? 'dragging' : ''}`}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <IonTextarea
                        ref={textAreaRef}
                        value={lessonContent}
                        onIonChange={(e) => setLessonContent(e.detail.value!)}
                        placeholder="Enter your lesson content or drag & drop a file here..."
                        autoGrow
                        className="lesson-textarea"
                        rows={12}
                    />

                    {isDragging && (
                        <div className="drop-overlay">
                            <IonIcon icon={documentAttachOutline} size="large" />
                            <p>Drop file to upload</p>
                        </div>
                    )}

                    {fileName && (
                        <IonText color="medium" className="file-info">
                            <p><strong>Fișier încărcat:</strong> {fileName}</p>
                        </IonText>
                    )}
                </div>

                <div className="generate-button-container">
                    <IonButton
                        expand="block"
                        onClick={handleGenerateQuestions}
                        disabled={loading || !lessonContent.trim()}
                    >
                        Generate Questions
                    </IonButton>
                </div>

                <IonLoading isOpen={loading} message="Processing..." />

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

                {questions.length > 0 ? (
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

                        <div className="export-button-container">
                            <IonButton
                                expand="block"
                                color="success"
                                onClick={handleExportQuestions}
                                className="export-button"
                            >
                                <IonIcon slot="start" icon={downloadOutline} />
                                Export Questions
                            </IonButton>
                        </div>
                    </div>
                ) : lessonContent && !loading && !error ? (
                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>No questions generated</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>Try adjusting your input text or check the API response format.</p>
                        </IonCardContent>
                    </IonCard>
                ) : null}
            </IonContent>
        </IonPage>
    );
};

export default GenerateQuestion;