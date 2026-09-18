import React from 'react';
import {createRoot} from 'react-dom/client';
import Page from '../modules/finance/app/page';
import '../modules/finance/app/globals.css';
createRoot(document.getElementById('root')!).render(<Page/>);
