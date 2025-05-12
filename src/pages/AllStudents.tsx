// src/pages/AllStudents.tsx
import {
    IonButton,
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonLoading,
    IonText,
    IonSearchbar,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonCard
} from '@ionic/react';
import { useState, useEffect } from 'react';
import { useHistory } from 'react-router';
import { refreshOutline, alertCircleOutline } from 'ionicons/icons';
import { userService } from '../services/api';
import axios, { AxiosError } from 'axios';
import './AllStudents.css';

interface Student {
    id: string;
    email: string;
    fullName: string;
    role: string;
}

const AllStudents: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const history = useHistory();

    const fetchStudents = async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }
        setError(null);

        try {
            const response = await userService.getAllUsers();
            // Make sure we're accessing the data correctly based on API response structure
            const userData = Array.isArray(response.data) ? response.data : [];

            // Filter users with role USER
            const userStudents = userData.filter(
                (user: Student) => user.role === 'USER'
            );
            setStudents(userStudents);
        } catch (error: unknown) {
            console.error('Failed to fetch students:', error);

            const axiosError = error as AxiosError;
            setError(axiosError.message || 'Failed to load students');

            // Handle unauthorized access
            if (axios.isAxiosError(error) && axiosError.response?.status === 401) {
                history.push('/home');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, []);

    const handleRefresh = async (event: CustomEvent) => {
        await fetchStudents(false);
        event.detail.complete();
    };

    const filteredStudents = students.filter(student =>
        student.email.toLowerCase().includes(searchText.toLowerCase()) ||
        student.fullName.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>All Students</IonTitle>
                    <IonButton slot="end" fill="clear" onClick={() => history.push('/dashboard')}>
                        Back
                    </IonButton>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
                    <IonRefresherContent
                        pullingIcon={refreshOutline}
                        pullingText="Pull to refresh"
                        refreshingSpinner="circles"
                        refreshingText="Loading students...">
                    </IonRefresherContent>
                </IonRefresher>

                <div className="ion-padding">
                    <IonSearchbar
                        value={searchText}
                        onIonChange={e => setSearchText(e.detail.value!)}
                        placeholder="Search by name or email"
                    />

                    {loading ? (
                        <IonLoading isOpen={loading} message="Loading students..." />
                    ) : error ? (
                        <div className="ion-padding ion-text-center">
                            <IonIcon icon={alertCircleOutline} color="danger" size="large" />
                            <IonText color="danger">
                                <h4>Error: {error}</h4>
                            </IonText>
                            <IonButton onClick={() => fetchStudents()}>
                                Retry
                            </IonButton>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <IonCard className="ion-padding ion-text-center">
                            <IonText color="medium">
                                {searchText ? 'No students match your search' : 'No students found'}
                            </IonText>
                        </IonCard>
                    ) : (
                        <div className="student-table">
                            <table>
                                <thead>
                                <tr>
                                    <th>Full Name</th>
                                    <th>Email</th>
                                </tr>
                                </thead>
                                <tbody>
                                {filteredStudents.map(student => (
                                    <tr key={student.id}>
                                        <td>{student.fullName}</td>
                                        <td>{student.email}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </IonContent>
        </IonPage>
    );
};

export default AllStudents;