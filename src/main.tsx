import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './preview/preview.css';
import './preview/seed';
import App from './App';
import PreviewBanner from './preview/PreviewBanner';
ReactDOM.createRoot(document.getElementById('root')!).render(<><PreviewBanner /><App /></>);
