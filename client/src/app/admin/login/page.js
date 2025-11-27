'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useAuth from '@/hooks/useAuth';

const AdminLoginPage = () => {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form);
      if (user.role !== 'admin') {
        alert('Admin access required');
        return;
      }
      router.push('/admin/dashboard');
    } catch (error) {
      alert(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="form-card">
      <h2>Admin login</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
        </div>
        <button className="btn" disabled={loading}>
          {loading ? 'Authorizing...' : 'Login'}
        </button>
      </form>
    </section>
  );
};

export default AdminLoginPage;

