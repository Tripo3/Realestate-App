import React from 'react';

const LoadingSpinner = ({ size = 'medium', message = 'Loading...' }) => {
  const sizeMap = { small: '24px', medium: '40px', large: '60px' };
  const dimension = sizeMap[size] || sizeMap.medium;

  return (
    <div className="loading-spinner-container">
      <div
        className="loading-spinner"
        style={{ width: dimension, height: dimension }}
      ></div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
