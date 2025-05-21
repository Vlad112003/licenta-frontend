import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Home from './pages/Home';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import { AuthProvider } from './contexts/AuthContext';
import AllStudents from "./pages/AllStudents";
import GenerateQuestion from "./pages/GenerateQuestion";
import GenerateQuiz from "./pages/GenerateQuiz";
import GenerateGridQuiz from "./pages/GenerateGridQuiz";
import GenerateObjectiveQuiz from "./pages/GenerateObjectiveQuiz";

setupIonicReact();

const App: React.FC = () => (
    <AuthProvider>
      <IonApp>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route exact path="/home">
              <Home />
            </Route>
            <Route exact path="/register">
              <Register />
            </Route>
            <Route exact path="/dashboard">
              <Dashboard />
            </Route>
            <Route exact path="/all-students">
              <AllStudents />
            </Route>
            <Route exact path="/generate-questions">
                   <GenerateQuestion />
            </Route>
            <Route exact path="/generate-quiz">
                   <GenerateQuiz />
            </Route>
            <Route exact path="/generate-grid-quiz">
              <GenerateGridQuiz />
            </Route>
            <Route exact path="/generate-objective-quiz">
              <GenerateObjectiveQuiz />
            </Route>
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
          </IonRouterOutlet>
        </IonReactRouter>
      </IonApp>
    </AuthProvider>
);

export default App;