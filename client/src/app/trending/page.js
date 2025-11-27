'use client';

import { useEffect, useState } from 'react';
import NewsCard from '@/components/NewsCard';
import { getTrendingNews } from '@/lib/api';

const TrendingPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await getTrendingNews();
        setItems(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <p>Loading trending topics...</p>;
  }

  return (
    <section>
      <header>
        <h1>Trending Topics (Auto Drafts)</h1>
        <p>Fresh summaries generated every 30 minutes from Google and Gemini.</p>
      </header>
      <div className="news-grid">
        {items.map((item) => (
          <NewsCard key={item._id} item={item} />
        ))}
      </div>
      {items.length === 0 && <p>No trending drafts available right now.</p>}
    </section>
  );
};

export default TrendingPage;

