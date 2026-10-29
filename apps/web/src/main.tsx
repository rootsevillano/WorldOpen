import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './ui/Root';
import './ui/style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
