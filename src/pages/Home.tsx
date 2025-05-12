import {IonButton, IonContent, IonInput, IonLoading, IonPage, IonText} from '@ionic/react';
import './Home.css';
import { useAuth } from '../contexts/AuthContext';
import {useState} from "react";
import {useHistory} from "react-router";
import {Link} from 'react-router-dom';

const Home: React.FC = () => {

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading } = useAuth() || {};
    const history = useHistory();

    const handleLogin = async () => {
        try {
            await login(email, password);
            history.push('/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    return (
        <IonPage>
            <IonContent className="ion-padding">
                <h1>Login</h1>
                <IonInput
                    label="Email"
                    type="email"
                    value={email}
                    onIonChange={(e) => setEmail(e.detail.value!)}
                />
                <IonInput
                    label="Password"
                    type="password"
                    value={password}
                    onIonChange={(e) => setPassword(e.detail.value!)}
                />
                <IonButton expand="block" onClick={handleLogin}>
                    Login
                </IonButton>
                <div className="ion-text-center ion-padding-top">
                    <IonText>Don't have an account? <Link to="/register">Register here</Link></IonText>
                </div>
                <IonLoading isOpen={loading} />
            </IonContent>
        </IonPage>
    );
};

export default Home;