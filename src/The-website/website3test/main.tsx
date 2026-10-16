import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '../../styles/design-system.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import { Website3TestPage } from './Website3TestPage';

const root = document.getElementById('root')!;
const page = <StrictMode><Website3TestPage /></StrictMode>;
if (root.querySelector('main')) hydrateRoot(root, page);
else createRoot(root).render(page);
