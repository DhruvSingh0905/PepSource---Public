import React from 'react';
import './ErrorDisplay.css'; // We'll create this file next

interface ErrorDisplayProps {
  message: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message }) => {
  return (
    <div className="error-display">
      <div className="error-content">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{message}</div>
      </div>
    </div>
  );
};

export default ErrorDisplay; 