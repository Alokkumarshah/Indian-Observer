'use client';

import { useEffect, useMemo, useState } from 'react';
import NewsCard from '@/components/NewsCard';
import useAuth from '@/hooks/useAuth';
import { addComment, getPublishedNews, getTrendingNews } from '@/lib/api';

const placeholderHero = {
  topic: 'Budget 2025: What The Indian Observer Analysis Reveals',
  summary:
    'As the finance ministry readies its budget pitch, fiscal math, welfare priorities, and manufacturing incentives collide in an election-year balancing act.',
  category: 'Economy',
};

const placeholderBriefs = [
  { category: 'Politics', headline: 'Election dates announced for three states next quarter.' },
  { category: 'Markets', headline: 'Sensex holds near record despite global headwinds.' },
  { category: 'Science', headline: 'ISRO outlines roadmap for reusable launch systems.' },
  { category: 'Cities', headline: 'Delhi rolls out phase two of its air emergency plan.' },
  { category: 'Opinion', headline: 'Why India needs a digital competition policy now.' },
];

const placeholderVideos = [
  { title: 'Explained: India’s Green Energy Bets', thumbnail: null },
  { title: 'CityCheck: Mumbai Coastal Road Progress', thumbnail: null },
  { title: 'In Conversation: RBI Governor on inflation', thumbnail: null },
  { title: 'Observer Spotlight: India at COP30', thumbnail: null },
];

const placeholderTimeline = [
  {
    topic: 'Global investors warm up to Bharat Chips mission',
    summary: 'Semiconductor PLI tranche two triggers record expressions of interest from fabs across Asia.',
    category: 'Markets',
    publishedAt: new Date().toISOString(),
  },
  {
    topic: 'Explained: Why Delhi’s smog plan hinges on regional coal curbs',
    summary: 'Pollution board leans on Punjab-Haryana coordination to slash stubble burning in peak season.',
    category: 'Cities',
    publishedAt: new Date().toISOString(),
  },
  {
    topic: 'The Indian women’s hockey rebuild is ahead of schedule',
    summary: 'New coach brings European-style pressing ahead of Paris qualifying leg.',
    category: 'Sports',
    publishedAt: new Date().toISOString(),
  },
];

const placeholderTrending = [
  {
    topic: 'EV policy revamp gets fast-tracked',
    summary:
      'After a fresh round of consultations, the transport ministry has advanced the new EV roadmap with focus on domestic manufacturing, battery swapping, and incentives for state fleets.',
    sourceOptions: [
      { source: 'Economic Daily', link: '#', snippet: 'India weighs new EV import duty structure.' },
    ],
    generatedAt: new Date().toISOString(),
  },
  {
    topic: 'Chandrayaan follow-on mission',
    summary:
      'ISRO is consolidating experiments from the lunar south pole mission to inform its next launch cycle, with global partners keen on navigation payloads.',
    sourceOptions: [{ source: 'SpaceWire', link: '#', snippet: 'International payload proposals submitted.' }],
    generatedAt: new Date().toISOString(),
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [trendingItems, setTrendingItems] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(6);

  const loadNews = async () => {
    const [{ data: published }, { data: trending }] = await Promise.all([
      getPublishedNews(),
      getTrendingNews(),
    ]);
    setItems(published);
    setTrendingItems(trending);
  };

  useEffect(() => {
    loadNews().catch(() => {
      setItems([]);
      setTrendingItems([]);
    });
  }, []);

  const handleFilterChange = (category) => {
    setActiveFilter(category);
    setVisibleCount(6);
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 4);
  };

  const handleComment = async (id) => {
    if (!commentDrafts[id]) return;
    setSubmitting(true);
    try {
      await addComment(id, commentDrafts[id]);
      setCommentDrafts((prev) => ({ ...prev, [id]: '' }));
      await loadNews();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to comment');
    } finally {
      setSubmitting(false);
    }
  };

  const heroStory = items[0] || placeholderHero;
  const contentPool = heroStory._id ? items.slice(1) : items;

  const subStories = useMemo(() => {
    const pool = contentPool.slice(0, 2);
    if (pool.length === 0) {
      return [
        {
          topic: 'States push for larger GST compensation window',
          summary: 'Finance ministers from multiple states will seek an extension at the upcoming council meet.',
        },
        {
          topic: 'Chandrayaan team eyes lunar south pole base plan',
          summary: 'Scientists outline habitat architecture alongside ISRO’s next mission cycle.',
        },
      ];
    }
    return pool;
  }, [contentPool]);

  const briefs = useMemo(() => {
    if (items.length === 0) return placeholderBriefs;
    return items.slice(0, 6).map((item) => ({
      category: item.category || (item.tags?.[0] || 'Latest'),
      headline: item.title || item.topic,
    }));
  }, [items]);

  const watchItems = useMemo(() => {
    const source = items.slice(1, 5);
    if (!source.length) return placeholderVideos;
    return source.map((item) => ({
      title: item.title || item.topic,
      thumbnail: item.imageUrl || item.primaryImage || null,
    }));
  }, [items]);

  const categoryOptions = useMemo(() => {
    const base = new Set(['All']);
    contentPool.forEach((story) => {
      const label = story.category || story.tags?.[0];
      if (label) base.add(label);
    });
    if (base.size === 1) {
      placeholderTimeline.forEach((story) => base.add(story.category));
    }
    return Array.from(base);
  }, [contentPool]);

  const filteredStories = useMemo(() => {
    if (!contentPool.length) return [];
    if (activeFilter === 'All') return contentPool;
    return contentPool.filter((story) => {
      const label = story.category || story.tags?.[0];
      return label?.toLowerCase() === activeFilter.toLowerCase();
    });
  }, [contentPool, activeFilter]);

  const timelineSource = filteredStories.length ? filteredStories : placeholderTimeline;
  const timelineStories = timelineSource.slice(0, visibleCount);

  const getStoryCategory = (story) => story.category || story.tags?.[0] || 'Latest';

  const getTimestamp = (story) => {
    const base = story.publishedAt || story.generatedAt;
    if (!base) return 'Just now';
    try {
      return new Date(base).toLocaleString();
    } catch {
      return 'Just now';
    }
  };

  const renderCommentPreview = (item) => {
    if (!item.comments?.length) return null;
    return (
      <div>
        <strong>{item.comments.length} comment(s)</strong>
        {item.comments.slice(-3).map((comment) => (
          <div key={comment._id} className="comment-block">
            <p>{comment.text}</p>
            <small>{new Date(comment.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    );
  };

  const renderCommentComposer = (item) => {
    if (!item._id) return null;
    if (user) {
      return (
        <div className="form-field">
          <textarea
            rows={3}
            placeholder="Add your comment"
            value={commentDrafts[item._id] || ''}
            onChange={(e) =>
              setCommentDrafts((prev) => ({ ...prev, [item._id]: e.target.value }))
            }
          />
          <button
            className="btn"
            disabled={submitting || !commentDrafts[item._id]}
            onClick={() => handleComment(item._id)}
          >
            Post Comment
          </button>
        </div>
      );
    }
    return !loading ? <small>Login or register to comment.</small> : null;
  };

  const trendingFeed = trendingItems.length ? trendingItems : placeholderTrending;

  const renderSourceList = (story) => {
    if (!story.sourceOptions?.length) return null;
    return (
      <ul className="observer-source-list">
        {story.sourceOptions.slice(0, 3).map((option, idx) => (
          <li key={`${story.topic}-${idx}`}>
            <span>{option.source || 'Source'}</span>
            {option.link && (
              <a href={option.link} target="_blank" rel="noreferrer">
                Read
              </a>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section>
      <div className="observer-section-heading">
        <p>SECTION 01</p>
        <div>
          <h2>General News Pipeline</h2>
          <small>Freshly summarized stories, updated by the normal news ingestion job.</small>
        </div>
      </div>

      <div className="observer-grid">
        <aside className="observer-briefs">
          <p className="observer-section-title">TOP BRIEFS</p>
          {briefs.map((brief, idx) => (
            <div key={`${brief.headline}-${idx}`} className="observer-brief">
              <small>{brief.category.toUpperCase()}</small>
              <p>{brief.headline}</p>
            </div>
          ))}
        </aside>

        <div>
          <article className="observer-hero">
            <h1>{heroStory.title || heroStory.topic}</h1>
            <div
              className="observer-hero__image"
              style={{
                backgroundImage: heroStory.imageUrl ? `url(${heroStory.imageUrl})` : undefined,
              }}
            />
            <p className="observer-hero__summary">{heroStory.summary}</p>

            {heroStory._id && (
              <div style={{ marginTop: '0.5rem' }}>
                {renderCommentComposer(heroStory)}
              </div>
            )}
          </article>

          <div className="observer-subgrid">
            {subStories.map((story, idx) => (
              <div key={`${story.topic}-${idx}`} className="observer-substory">
                <h3>{story.title || story.topic}</h3>
                <p>{story.summary}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="observer-watch">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="observer-section-title" style={{ marginBottom: 0 }}>FEATURED VIDEOS</p>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{'>'}</span>
          </div>
          <div
            className="observer-watch__hero"
            style={{
              backgroundImage: watchItems[0]?.thumbnail ? `url(${watchItems[0].thumbnail})` : undefined,
            }}
          >
            <button type="button" aria-label="Play video">▶</button>
          </div>
          <div className="observer-watch__list">
            {watchItems.map((video, idx) => (
              <div key={`${video.title}-${idx}`} className="observer-watch__item">
                <div
                  className="observer-watch__thumb"
                  style={{ backgroundImage: video.thumbnail ? `url(${video.thumbnail})` : undefined }}
                />
                <p>{video.title}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="observer-latest">
        <div className="observer-latest__header">
          <h2>Latest from The Indian Observer</h2>
          <div className="observer-chip-bar">
            {categoryOptions.map((category) => (
              <button
                key={category}
                type="button"
                className={`observer-chip ${activeFilter === category ? 'active' : ''}`}
                onClick={() => handleFilterChange(category)}
              >
                {category.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="observer-timeline">
          {timelineStories.map((story, idx) => {
            const category = getStoryCategory(story);
            const timestamp = story._id ? getTimestamp(story) : 'Updated just now';
            const key = story._id || `placeholder-${idx}`;

            return (
              <div key={key} className="observer-timeline__item">
                <span className="observer-timeline__dot" />
                <div className="observer-timeline__meta">
                  <span>{category.toUpperCase()}</span>
                  <time>{timestamp}</time>
                </div>
                {story._id ? (
                  <NewsCard item={story}>
                    {renderCommentPreview(story)}
                    {renderCommentComposer(story)}
                  </NewsCard>
                ) : (
                  <div className="observer-timeline__placeholder">
                    <h4>{story.topic}</h4>
                    <p>{story.summary}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {timelineSource.length > visibleCount && (
          <button type="button" className="btn observer-load-more" onClick={handleLoadMore}>
            Load more stories
          </button>
        )}
        {!filteredStories.length && items.length > 0 && (
          <p style={{ marginTop: '1rem', color: '#475569' }}>
            No stories yet in {activeFilter}. Please check back later.
          </p>
        )}
      </div>

      <div className="observer-section-heading" style={{ marginTop: '4rem' }}>
        <p>SECTION 02</p>
        <div>
          <h2>Trending News Pipeline</h2>
          <small>Live topics synthesized from SERP trends + Gemini narrative.</small>
        </div>
      </div>

      <div className="observer-trending">
        {trendingFeed.map((trend, idx) => (
          <article key={trend._id || trend.topic || idx} className="observer-trending__card">
            <header>
              <span>Trend #{String(idx + 1).padStart(2, '0')}</span>
              <time>{getTimestamp(trend)}</time>
            </header>
            <h3>{trend.title || trend.topic}</h3>
            <p>{trend.summary}</p>
            {renderSourceList(trend)}
          </article>
        ))}
        {trendingItems.length === 0 && (
          <p className="observer-trending__empty">
            Trending feed will populate automatically once the pipeline runs.
          </p>
        )}
      </div>
    </section>
  );
}
