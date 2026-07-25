import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthCallback = () => {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const sessionId = params.get('session_id');

    if (!sessionId) {
      navigate('/login');
      return;
    }

    const exchangeSession = async () => {
      try {
        const response = await axios.post(`${API}/auth/session`, null, {
          params: { session_id: sessionId }
        });
        
        // Check if pending approval
        if (response.data.error === 'pending_approval') {
          navigate('/login', { state: { pendingApproval: true, message: response.data.message }, replace: true });
          return;
        }
        
        document.cookie = `session_token=${response.data.session_token}; path=/; secure; samesite=lax; max-age=604800`;
        localStorage.setItem('session_token', response.data.session_token);
        navigate('/app/dashboard', { state: { user: response.data }, replace: true });
      } catch (error) {
        console.error('Session exchange failed:', error);
        navigate('/login');
      }
    };

    exchangeSession();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1128' }}>
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#D4AF37' }} />
        <p className="mt-4 text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
