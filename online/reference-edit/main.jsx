import React from 'react';
import {createRoot} from 'react-dom/client';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import App from './App.jsx';
import './styles.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
createRoot(document.getElementById('root')).render(<App pdfjs={pdfjs}/>);
