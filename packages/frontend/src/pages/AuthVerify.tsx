import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth, setToken, setStoredUser } from '../api';

export default function AuthVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No token provided');
      return;
    }

    auth
      .verify(token)
      .then((data) => {
        setToken(data.token);
        setStoredUser(data.coach);
        if (data.coach.isLead) {
          navigate('/lead/players', { replace: true });
        } else {
          navigate('/coach/rate', { replace: true });
        }
      })
      .catch((err) => {
        setError(err.message || 'Verification failed');
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4 text-red-600">Verification Failed</h2>
          <p className="text-gray-600">{error}</p>
          <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
            Try logging in again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h2 className="text-2xl font-bold mb-4">Verifying...</h2>
        <p className="text-gray-600">Please wait while we sign you in.</p>
      </div>
    </div>
  );
}
