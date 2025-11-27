'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import { deleteNews, generateNews, getDrafts, publishNews, refreshTrending } from '@/lib/api';
import NewsCard from '@/components/NewsCard';

const DashboardPage = () => {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [generator, setGenerator] = useState({ topic: '', autoPublish: false });
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generationNote, setGenerationNote] = useState('');

  const loadDrafts = async () => {
    const { data } = await getDrafts();
    setDrafts(data);
  };

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/admin/login');
      } else if (user.role !== 'admin') {
        router.push('/');
      } else {
        loadDrafts();
      }
    }
  }, [user, loading, router]);

  const handleRefresh = async () => {
    setBusy(true);
    setStatus('Fetching trends...');
    try {
      const { data } = await refreshTrending();
      setStatus(`Fetched ${data.refreshed} topics`);
      await loadDrafts();
    } catch (error) {
      alert(error.response?.data?.message || 'Refresh failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async (id) => {
    setBusy(true);
    try {
      await publishNews(id);
      await loadDrafts();
    } catch (error) {
      alert(error.response?.data?.message || 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete draft?')) return;
    setBusy(true);
    try {
      await deleteNews(id);
      await loadDrafts();
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateNews = async (event) => {
    event.preventDefault();
    if (!generator.topic.trim()) {
      setGenerationNote('Topic is required');
      return;
    }
    setGenerateBusy(true);
    setGenerationNote('Contacting news API and Gemini…');
    try {
      const { data } = await generateNews({
        topic: generator.topic.trim(),
        autoPublish: generator.autoPublish,
      });
      setGenerationNote(`${data.message}: ${data.article.title || data.article.topic}`);
      setGenerator((prev) => ({ ...prev, topic: '' }));
      await loadDrafts();
    } catch (error) {
      setGenerationNote(error.response?.data?.message || 'Generation failed');
    } finally {
      setGenerateBusy(false);
    }
  };

  if (loading || !user || user.role !== 'admin') {
    return <p>Validating admin session...</p>;
  }

  return (
    <section>
      <header>
        <h1>Admin studio</h1>
        <p>Generate, review, and publish Gemini-backed stories.</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn" disabled={busy} onClick={handleRefresh}>
            Fetch trending drafts
          </button>
          <button className="btn secondary" onClick={logout}>
            Logout
          </button>
        </div>
        {status && <small>{status}</small>}
      </header>

      <section className="form-card" style={{ marginTop: '1rem' }}>
        <h3>Generate a story</h3>
        <p>We will pull live coverage from Google News via SerpAPI and let Gemini summarize it.</p>
        <form onSubmit={handleGenerateNews}>
          <div className="form-field">
            <label htmlFor="topic">Topic or keyword</label>
            <input
              id="topic"
              value={generator.topic}
              onChange={(e) => setGenerator((prev) => ({ ...prev, topic: e.target.value }))}
              placeholder="e.g., Chandrayaan mission update"
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={generator.autoPublish}
              onChange={(e) => setGenerator((prev) => ({ ...prev, autoPublish: e.target.checked }))}
            />
            Publish automatically to reader feed
          </label>
          <button className="btn" disabled={generateBusy}>
            {generateBusy ? 'Generating…' : 'Generate story'}
          </button>
        </form>
        {generationNote && <small>{generationNote}</small>}
      </section>

      <h2 style={{ margin: '1.5rem 0 1rem' }}>Draft queue</h2>
      <div className="news-grid">
        {drafts.map((item) => (
          <NewsCard key={item._id} item={item}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn" disabled={busy} onClick={() => handlePublish(item._id)}>
                Publish
              </button>
              <button className="btn secondary" disabled={busy} onClick={() => handleDelete(item._id)}>
                Delete
              </button>
            </div>
          </NewsCard>
        ))}
      </div>
      {drafts.length === 0 && <p>No drafts yet. Click “Fetch trending drafts”.</p>}
    </section>
  );
};

export default DashboardPage;

