'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getNewsById, getPublishedNews } from '@/lib/api';
import NewsCard from '@/components/NewsCard';

const formatDate = (value) => {
  if (!value) return 'Just now';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'Just now';
  }
};

export default function StoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [story, setStory] = useState(null);
  const [allNews, setAllNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storyId = useMemo(() => params?.id, [params]);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [storyResponse, newsResponse] = await Promise.all([
          getNewsById(storyId),
          getPublishedNews(),
        ]);
        if (!cancelled) {
          setStory(storyResponse.data);
          setAllNews(newsResponse.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err.response?.data?.message ||
            'We could not load this story. Please try again later.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const briefs = useMemo(() => {
    if (allNews.length === 0) return [];
    return allNews.slice(0, 6).map((item) => ({
      id: item._id,
      category: item.category || item.tags?.[0] || 'Latest',
      headline: item.title || item.topic,
    }));
  }, [allNews]);

  const relatedNews = useMemo(() => {
    if (!story || allNews.length === 0) return [];
    const storyCategory = story.category || story.tags?.[0] || '';
    return allNews
      .filter((item) => {
        const itemCategory = item.category || item.tags?.[0] || '';
        return (
          item._id !== story._id &&
          itemCategory.toLowerCase() === storyCategory.toLowerCase()
        );
      })
      .slice(0, 4);
  }, [story, allNews]);

  const heroImage = story?.imageUrl || story?.sourceOptions?.[0]?.imageUrl || null;

  if (!storyId) {
    return (
      <section className="story-detail">
        <p>Missing story identifier.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="story-detail">
        <p>Loading story...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="story-detail">
        <p className="story-detail__error">{error}</p>
        <button type="button" className="btn" onClick={() => router.push('/')}>
          Go back home
        </button>
      </section>
    );
  }

  if (!story) {
    return (
      <section className="story-detail">
        <p>Story not found.</p>
      </section>
    );
  }

  return (
    <section className="story-detail">
      <header className="story-detail__header">
        <div>
          <p className="story-detail__category">{story.category || 'Latest'}</p>
          <h1>{story.title || story.topic}</h1>
          <p className="story-detail__timestamp">{formatDate(story.publishedAt || story.generatedAt)}</p>
        </div>
        <div className="story-detail__tags">
          {(story.tags || []).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </header>

      {heroImage && (
        <div
          className="story-detail__hero"
          style={{ backgroundImage: `url(${heroImage})` }}
          role="img"
          aria-label={story.title || story.topic}
        />
      )}

      <div className="story-detail__layout">
        <aside className="story-detail__briefs">
          <p className="observer-section-title">TOP BRIEFS</p>
          {briefs.length > 0 ? (
            briefs.map((brief, idx) => {
              const content = (
                <>
                  <small>{brief.category.toUpperCase()}</small>
                  <p>{brief.headline}</p>
                </>
              );
              return (
                <div key={`${brief.headline}-${idx}`} className="observer-brief">
                  {brief.id ? (
                    <Link href={`/story/${brief.id}`} className="observer-brief__link">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </div>
              );
            })
          ) : (
            <p style={{ color: '#666', fontSize: '0.9rem' }}>No briefs available</p>
          )}
        </aside>

        <article className="story-detail__body">
          <h2>Observer Summary</h2>
          <p className="story-detail__summary">{story.summary}</p>

          {story.content && (
            <section className="story-detail__analysis" id="in-depth-analysis">
              <h3>In-depth Analysis</h3>
              <div className="story-detail__analysis-content">
                {story.content
                  .split(/\n{2,}/)
                  .map((block) => block.trim())
                  .filter(Boolean)
                  .map((block, index) => (
                    <p key={index}>{block}</p>
                  ))}
              </div>
            </section>
          )}


          {relatedNews.length > 0 && (
            <section className="story-detail__related">
              <h3>Related News</h3>
              <div className="story-detail__related-grid">
                {relatedNews.map((item) => (
                  <NewsCard key={item._id} item={item} />
                ))}
              </div>
            </section>
          )}
        </article>
      </div>

      <footer className="story-detail__footer">
        <Link href="/" className="btn secondary">
          ← Back to home
        </Link>
      </footer>
    </section>
  );
}


