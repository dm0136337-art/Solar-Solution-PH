import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SolarAssessmentPage from './SolarAssessmentPage.tsx';
import './index.css';
import './solar-assessment.css';

const page = window.location.pathname.replace(/\/+$/, '') === '/solar-assessment'
  ? <SolarAssessmentPage />
  : <App />;

createRoot(document.getElementById('root')!).render(page);
