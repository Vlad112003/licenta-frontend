import React from 'react';
import { Route, Redirect, RouteProps } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Define the props for PrivateRoute
interface PrivateRouteProps extends RouteProps {
    component: React.ComponentType<Record<string, unknown>>; // Replace `any` with a safer type
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ component: Component, ...rest }) => {
    const auth = useAuth();

    // Ensure `auth` is not null or undefined
    if (!auth) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    const { user, loading } = auth;

    return (
        <Route
            {...rest}
            render={(props) =>
                loading ? (
                    <div>Loading...</div>
                ) : user ? (
                    <Component {...props} />
                ) : (
                    <Redirect to="/login" />
                )
            }
        />
    );
};

export default PrivateRoute;