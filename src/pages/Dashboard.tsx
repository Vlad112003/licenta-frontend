// src/pages/Dashboard.tsx
import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonLoading, IonText } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import { useHistory } from 'react-router';
import { useEffect, useState } from 'react';
import { userService, authService } from '../services/api';

const Dashboard: React.FC = () => {
    const { logout } = useAuth() || {};
    const history = useHistory();
    const [email, setEmail] = useState('');
    const [userRole, setUserRole] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Fetch current user's information when component mounts
        const fetchUserData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Check if token exists
                const token = localStorage.getItem('token');
                if (!token) {
                    setError("No authentication token found");
                    history.push('/home');
                    return;
                }

                console.log("Fetching current user data...");
                const response = await userService.getCurrentUser();
                console.log("Current user data:", response.data);

                if (response.data && response.data.email) {
                    setEmail(response.data.email);
                    setUserRole(response.data.role || '');
                } else {
                    setError("User data incomplete");
                    console.error("User data missing fields:", response.data);
                }
            } catch (error: any) { // Changed from never to any
                console.error('Failed to fetch user data:', error);
                setError(error.response?.data?.message || error.message || "Failed to load user data");

                // Only redirect to login if there's an authentication issue (401)
                if (error.response?.status === 401) {
                    history.push('/home');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [history]);

    const handleLogout = async () => {
        try {
            if (logout) {
                await logout();
            } else {
                // Fallback if context logout is unavailable
                await authService.logout();
            }
            // No need to redirect here as the api.ts logout will handle it
        } catch (error) {
            console.error('Logout failed:', error);
            // Force navigation even if logout fails
            history.push('/home');
        }
    };

    // Rest of the component remains the same
    const renderUserDashboard = () => (
        <>
            <h1>Hello {email || 'Student'}</h1>
            <p>Welcome to your Student Dashboard</p>

            <IonButton expand="block" onClick={() => history.push('/generate-questions')}>
                Generate Questions
            </IonButton>

            <IonButton expand="block" onClick={() => history.push('/generate-quiz')}>
                Quiz Based on Your Text
            </IonButton>

            <IonButton expand="block" color="danger" onClick={handleLogout}>
                Logout
            </IonButton>
        </>
    );

    const renderAdminDashboard = () => (
        <>
            <h1>Hello Admin {email || 'Administrator'}</h1>
            <p>Welcome to the Admin Dashboard</p>

            <IonButton expand="block" onClick={() => history.push('/all-students')}>
                View All Students
            </IonButton>

            <IonButton expand="block" onClick={() => console.log('Create custom test clicked')}>
                Create Custom Test
            </IonButton>

            <IonButton expand="block" onClick={() => console.log('View grades clicked')}>
                View Student Grades
            </IonButton>

            <IonButton expand="block" color="danger" onClick={handleLogout}>
                Logout
            </IonButton>
        </>
    );

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>{userRole === 'ADMIN' ? 'Admin Dashboard' : 'Student Dashboard'}</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
                {loading ? (
                    <IonLoading isOpen={loading} message="Loading..." />
                ) : error ? (
                    <div className="ion-padding ion-text-center">
                        <IonText color="danger">
                            <h4>Error: {error}</h4>
                            <p>User role: {userRole || 'Unknown'}</p>
                        </IonText>
                        <IonButton onClick={() => window.location.reload()}>
                            Retry
                        </IonButton>
                        <IonButton color="medium" onClick={() => history.push('/home')}>
                            Back to Login
                        </IonButton>
                    </div>
                ) : (
                    userRole === 'ADMIN' ? renderAdminDashboard() : renderUserDashboard()
                )}
            </IonContent>
        </IonPage>
    );
};

export default Dashboard;