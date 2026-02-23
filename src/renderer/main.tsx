import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ScreenshotSelector from './components/ScreenshotSelector/ScreenshotSelector'
import ErrorBoundary from './components/Common/ErrorBoundary'
import './styles/globals.css'

const isSelector = window.location.hash === '#/selector'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSelector ? (
      <ScreenshotSelector />
    ) : (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )}
  </React.StrictMode>
)
