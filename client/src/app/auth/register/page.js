'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useAuth from '@/hooks/useAuth';

const RegisterPage = () => {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ ...form, role });
      router.push('/');
    } catch (error) {
      alert(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="form-card">
      <h2>Create your account</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
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
        <div className="form-field">
          <label htmlFor="role">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">Reader</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>
    </section>
  );
};

export default RegisterPage;

