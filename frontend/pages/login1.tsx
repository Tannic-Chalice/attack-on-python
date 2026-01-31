// frontend/pages/login1.tsx
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Login from '../components/Login';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Check if already logged in
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          router.replace('/');
        }
      } catch (error) {
        localStorage.clear();
      }
    }
  }, [router]);

  return <Login />;
}