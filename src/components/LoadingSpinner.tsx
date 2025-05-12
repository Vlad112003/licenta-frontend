import React from 'react';
import { IonSpinner, IonContent, IonText } from '@ionic/react';
import './LoadingSpinner.css'; // Fișier CSS separat pentru styling suplimentar

interface LoadingSpinnerProps {
    message?: string;
    fullScreen?: boolean;
    spinnerProps?: React.ComponentProps<typeof IonSpinner>;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
                                                           message = 'Loading...',
                                                           fullScreen = false,
                                                           spinnerProps = {}
                                                       }) => {
    const spinner = (
        <div className="spinner-container">
            <IonSpinner
                name="crescent" // 'lines', 'lines-small', 'dots', 'bubbles', 'circles', 'crescent'
                color="primary"
                {...spinnerProps}
            />
            {message && <IonText className="spinner-message">{message}</IonText>}
        </div>
    );

    return fullScreen ? (
        <IonContent className="fullscreen-spinner">
            {spinner}
        </IonContent>
    ) : spinner;
};

export default LoadingSpinner;