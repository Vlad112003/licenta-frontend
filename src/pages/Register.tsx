import {
    IonButton,
    IonContent,
    IonInput,
    IonLoading,
    IonPage,
    IonText,
    IonItem,
    IonLabel,
    IonNote
} from '@ionic/react';
import { useState, useEffect } from "react";
import { useHistory } from "react-router";
import { Link } from 'react-router-dom';
import { authService } from '../services/api';

// Define error interface without importing unused axios
interface ApiError {
    response?: {
        data?: {
            message?: string;
        };
    };
}

const Register: React.FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({
        name: '',
        email: '',
        password: ''
    });
    const [formValid, setFormValid] = useState(false);
    const history = useHistory();

    // Email validation regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    // Validate form when inputs change
    useEffect(() => {
        validateForm();
    }, [name, email, password]);

    const validateForm = () => {
        const newErrors = {
            name: '',
            email: '',
            password: ''
        };

        // Validate name
        if (name.trim().length === 0) {
            newErrors.name = 'Name is required';
        } else if (name.length < 2) {
            newErrors.name = 'Name must be at least 2 characters';
        }

        // Validate email
        if (email.trim().length === 0) {
            newErrors.email = 'Email is required';
        } else if (!emailRegex.test(email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        // Validate password
        if (password.trim().length === 0) {
            newErrors.password = 'Password is required';
        } else if (password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        setErrors(newErrors);

        // Form is valid if no errors
        const valid = !newErrors.name && !newErrors.email && !newErrors.password;
        setFormValid(valid);
    };

    const handleRegister = async () => {
        // Validate form before submission
        validateForm();

        if (!formValid) {
            return;
        }

        try {
            setLoading(true);
            await authService.register({ name, email, password });
            history.push('/');
        } catch (error: unknown) {
            console.error('Registration failed:', error);
            // Handle server errors
            const apiError = error as ApiError;
            if (apiError.response?.data?.message) {
                const errorMessage = apiError.response.data.message;
                if (errorMessage.includes('email')) {
                    setErrors(prev => ({
                        ...prev,
                        email: errorMessage || 'Email error'  // Ensure it's always a string
                    }));
                } else {
                    alert(`Registration failed: ${errorMessage}`);
                }
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonPage>
            <IonContent className="ion-padding">
                <h1>Register</h1>
                <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
                    <IonItem className={errors.name ? 'ion-invalid' : ''}>
                        <IonLabel position="floating">Name</IonLabel>
                        <IonInput
                            type="text"
                            value={name}
                            onIonChange={(e) => setName(e.detail.value!)}
                            required
                        />
                        {errors.name && <IonNote slot="error">{errors.name}</IonNote>}
                    </IonItem>

                    <IonItem className={errors.email ? 'ion-invalid' : ''}>
                        <IonLabel position="floating">Email</IonLabel>
                        <IonInput
                            type="email"
                            value={email}
                            onIonChange={(e) => setEmail(e.detail.value!)}
                            required
                        />
                        {errors.email && <IonNote slot="error">{errors.email}</IonNote>}
                    </IonItem>

                    <IonItem className={errors.password ? 'ion-invalid' : ''}>
                        <IonLabel position="floating">Password</IonLabel>
                        <IonInput
                            type="password"
                            value={password}
                            onIonChange={(e) => setPassword(e.detail.value!)}
                            required
                        />
                        {errors.password && <IonNote slot="error">{errors.password}</IonNote>}
                    </IonItem>

                    <div className="ion-padding-top">
                        <IonButton
                            expand="block"
                            type="submit"
                            disabled={!formValid}
                        >
                            Register
                        </IonButton>
                    </div>
                </form>

                <div className="ion-text-center ion-padding-top">
                    <IonText>Already have an account? <Link to="/">Login here</Link></IonText>
                </div>
                <IonLoading isOpen={loading} message="Registering..." />
            </IonContent>
        </IonPage>
    );
};

export default Register;