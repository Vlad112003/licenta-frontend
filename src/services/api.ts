// Update your api.ts file with this improved implementation
import axios from 'axios';

// Create axios instance
const api = axios.create({
    baseURL: 'http://localhost:8080',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Function to setup token in API headers
export const setupAuthToken = () => {
    const token = localStorage.getItem('token');
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common['Authorization'];
    }
};

// Initialize headers with token if available
setupAuthToken();

// Add request interceptor for debugging
api.interceptors.request.use(
    config => {
        console.log('Request being sent:', config);
        return config;
    },
    error => {
        console.error('Request error:', error);
        return Promise.reject(error);
    }
);

// Add response interceptor for debugging
api.interceptors.response.use(
    response => {
        console.log('Response received:', response);
        return response;
    },
    error => {
        console.error('Response error:', error.response || error);
        return Promise.reject(error);
    }
);

export const authService = {
    login: (email: string, password: string) =>
        api.post('/api/auth/login', { email, password })
            .then(response => {
                console.log('Login response:', response.data);
                // If the server returns a token, save it
                if (response.data && response.data.token) {
                    // Clear any existing tokens first
                    localStorage.removeItem('token');
                    // Set the new token
                    localStorage.setItem('token', response.data.token);
                    // Update axios headers
                    setupAuthToken();
                }
                return response;
            }),
    register: (userData: { email: string; password: string; name: string }) =>
        api.post('/api/auth/register', {
            email: userData.email,
            password: userData.password,
            fullName: userData.name
        }),
    logout: async () => {
        try {
            // Call the backend logout endpoint
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Error during logout API call:', error);
            // Continue with cleanup even if API call fails
        } finally {
            // Remove the token from axios headers
            delete api.defaults.headers.common['Authorization'];
            // Remove from localStorage
            localStorage.removeItem('token');
            // Force a page reload to clear any in-memory state
            window.location.href = '/home';
            return true;
        }
    }
};

export const userService = {
    getCurrentUser: () => api.get('/api/auth/current-user'),
    getAllUsers: () => api.get('/api/users')
};

export default api;