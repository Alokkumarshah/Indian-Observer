'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import NewsCard from '@/components/NewsCard';
import useAuth from '@/hooks/useAuth';
import { addComment, getPublishedNews, getTrendingNews, getTrendingStatus } from '@/lib/api';

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

const STALE_THRESHOLD_MS = 1000 * 60 * 60 * 6;

const SECTION_DEFINITIONS = [
  {
    id: 'world',
    label: 'World',
    title: 'World Watch',
    subtitle: 'Global flashpoints that shape India’s next moves.',
    category: 'World',
    placeholders: [
      {
        topic: 'BRICS expansion redraws trade corridors',
        summary: 'Energy alliances and local currency trade experiments accelerate as new members formalize entry terms.',
      },
      {
        topic: 'Climate financing pact nears breakthrough',
        summary: 'Island states push a loss-and-damage facility with blended finance from the G20 and development banks.',
      },
    ],
  },
  {
    id: 'politics',
    label: 'Politics',
    title: 'Capital Circuit',
    subtitle: 'Policy maneuvers, campaign trails, and parliamentary math.',
    category: 'Politics',
    placeholders: [
      {
        topic: 'Winter session agenda leaked ahead of schedule',
        summary: 'Electoral bonds overhaul, MSP bill, and digital competition draft dominate party whips’ briefing.',
      },
      {
        topic: 'States seek GST compensation extension once more',
        summary: 'A united front of finance ministers wants a three-year glide path to taper deficit grants.',
      },
    ],
  },
  {
    id: 'sports',
    label: 'Sports',
    title: 'The Sporting Edge',
    subtitle: 'Training tables, squad rebuilds, and clutch finishes.',
    category: 'Sports',
    placeholders: [
      {
        topic: 'Hockey federation unveils Paris roadmap',
        summary: 'High-altitude camp in Himachal blends European pressing drills with set-piece reinvention.',
      },
      {
        topic: 'Cricket board fast-tracks pace academy',
        summary: 'Biomechanics lab near Bengaluru will monitor workloads across IPL and Ranji schedules.',
      },
    ],
  },
  {
    id: 'tech',
    label: 'Tech',
    title: 'Next-Gen Tech',
    subtitle: 'Deep dives into semiconductors, AI policy, and startup momentum.',
    category: 'Tech',
    placeholders: [
      {
        topic: 'Chip mission clears second fab cluster',
        summary: 'PLI tranche two incentives draw Taiwanese packaging majors to Maharashtra’s coastal belt.',
      },
      {
        topic: 'AI Safety Board drafts voluntary guardrails',
        summary: 'Model watermarking and bias stress tests will accompany any public-sector deployments.',
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    title: 'Boardroom Briefing',
    subtitle: 'Earnings resets, deals, and macro cues for Indian companies.',
    category: 'Business',
    placeholders: [
      {
        topic: 'Banking mergers move into final approvals',
        summary: 'Twin PSU banks inch closer to integration as RBI greenlights IT stack harmonization.',
      },
      {
        topic: 'Domestic airlines lock record aircraft leases',
        summary: 'Fuel hedging gains and inbound tourist surge underpin aggressive capacity expansion.',
      },
    ],
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [trendingItems, setTrendingItems] = useState([]);
  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(6);

  const loadNews = async () => {
    const [{ data: published }, { data: trending }, statusResponse] = await Promise.all([
      getPublishedNews(),
      getTrendingNews(),
      getTrendingStatus().catch(() => ({ data: null })),
    ]);
    
    // Deduplicate by _id to prevent duplicate rendering
    const uniquePublished = Array.from(
      new Map(published?.map((item) => [item._id, item]) || []).values()
    );
    const uniqueTrending = Array.from(
      new Map(trending?.map((item) => [item._id, item]) || []).values()
    );
    
    setItems(uniquePublished);
    setTrendingItems(uniqueTrending);
    setIngestionStatus(statusResponse?.data || null);
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

  const heroStory = items[0] || null;
  const contentPool = heroStory?._id ? items.slice(1) : items;

  const subStories = useMemo(() => {
    return contentPool.slice(0, 2);
  }, [contentPool]);

  const briefs = useMemo(() => {
    return items.slice(0, 6).map((item) => ({
      id: item._id,
      category: item.category || item.tags?.[0] || 'Latest',
      headline: item.title || item.topic,
    }));
  }, [items]);

  const watchItems = useMemo(() => {
    return items.slice(1, 5).map((item) => ({
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

  const timelineStories = filteredStories.slice(0, visibleCount);

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

  const trendingFeed = trendingItems;
  const lastRefresh =
    ingestionStatus?.lastRunFinishedAt && new Date(ingestionStatus.lastRunFinishedAt);
  const isStale =
    lastRefresh && Date.now() - lastRefresh.getTime() > STALE_THRESHOLD_MS;

  const topicalSections = useMemo(
    () =>
      SECTION_DEFINITIONS.map((section) => {
        const stories = contentPool.filter(
          (story) => getStoryCategory(story).toLowerCase() === section.category.toLowerCase()
        );
        return { ...section, stories };
      }),
    [contentPool]
  );

  const renderSourceList = (story) => {
    if (!story?.sourceOptions?.length) return null;

    return (
      <ul className="observer-source-list">
        {story.sourceOptions.slice(0, 3).map((option, idx) => {
          const sourceLink = option.link || option.news_url || null;
          const sourceName = option.source || 'Source';
          
          return (
            <li key={`${story.topic || story.title || 'story'}-${idx}`}>
              {sourceLink ? (
                <a
                  href={sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="observer-source-link"
                >
                  <span>{sourceName}</span>
                </a>
              ) : (
                <span>{sourceName}</span>
              )}
              {option.snippet && <small>{option.snippet}</small>}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <section id="home">
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
          {briefs.length > 0 ? (
            briefs.map((brief, idx) => {
              const content = (
                <>
                  <small>{brief.category.toUpperCase()}</small>
                  <p>{brief.headline}</p>
                </>
              );
              return (
                <div key={brief.id || `brief-${idx}`} className="observer-brief">
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
            <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem' }}>
              No briefs available. News will appear here once published.
            </p>
          )}
        </aside>

        <div>
          {heroStory ? (
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
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Link href={`/story/${heroStory._id}`} className="btn">
                    Read Observer summary
                  </Link>
                  {renderCommentComposer(heroStory)}
                </div>
              )}
            </article>
          ) : (
            <article className="observer-hero">
              <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                No featured story available. News will appear here once the ingestion pipeline runs.
              </p>
            </article>
          )}

          {subStories.length > 0 && (
            <div className="observer-subgrid">
              {subStories.map((story, idx) => (
                <div key={story._id || `story-${idx}`} className="observer-substory">
                  {story._id ? (
                    <Link href={`/story/${story._id}`}>
                      <h3>{story.title || story.topic}</h3>
                    </Link>
                  ) : (
                    <h3>{story.title || story.topic}</h3>
                  )}
                  <p>{story.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="observer-watch">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="observer-section-title" style={{ marginBottom: 0 }}>FEATURED STORIES</p>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{'>'}</span>
          </div>
          <div
            className="observer-watch__hero"
            style={{
              backgroundImage: watchItems[0]?.thumbnail ? `url(${watchItems[0].thumbnail})` : undefined,
            }}
          >
            {/* <button type="button" aria-label="Play video">▶</button> */}
          </div>
          <div className="observer-watch__list">
            {watchItems.length > 0 ? (
              watchItems.map((video, idx) => (
                <div key={`${video.title}-${idx}`} className="observer-watch__item">
                  <div
                    className="observer-watch__thumb"
                    style={{ backgroundImage: video.thumbnail ? `url(${video.thumbnail})` : undefined }}
                  />
                  <p>{video.title}</p>
                </div>
              ))
            ) : (
              <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem', padding: '1rem' }}>
                No featured stories available.
              </p>
            )}
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
          {timelineStories.length > 0 ? (
            timelineStories.map((story, idx) => {
              const category = getStoryCategory(story);
              const timestamp = story._id ? getTimestamp(story) : 'Updated just now';

              return (
                <div key={story._id || `story-${idx}`} className="observer-timeline__item">
                  <span className="observer-timeline__dot" />
                  <div className="observer-timeline__meta">
                    <span>{category.toUpperCase()}</span>
                    <time>{timestamp}</time>
                  </div>
                  {story._id && (
                    <NewsCard item={story}>
                      {renderCommentPreview(story)}
                      {renderCommentComposer(story)}
                    </NewsCard>
                  )}
                </div>
              );
            })
          ) : (
            <p style={{ color: '#64748b', fontStyle: 'italic', marginTop: '2rem' }}>
              No stories available in this category. News will appear here once published.
            </p>
          )}
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

      </section>

      <section id="trending">
        <div className="observer-section-heading" style={{ marginTop: '4rem' }}>
          <p>SECTION 02</p>
          <div>
            <h2>Trending News Pipeline</h2>
            <small>Live topics synthesized from SERP trends + Gemini narrative.</small>
          </div>
          {ingestionStatus && (
            <span
              className={`observer-status observer-status--${ingestionStatus.lastRunStatus || 'idle'}`}
            >
              Last refresh:{' '}
              {lastRefresh ? lastRefresh.toLocaleString() : 'pending'}
            </span>
          )}
        </div>
        {isStale && (
          <p className="observer-stale-note">
            Feeds look stale (older than 6 hours). An admin should trigger a refresh soon.
          </p>
        )}

        <div className="observer-trending">
          {trendingFeed.length > 0 ? (
            trendingFeed.map((trend, idx) => {
              const externalUrl = trend.externalUrl || trend.primaryLink;
              const storyUrl = trend._id ? `/story/${trend._id}` : null;
              
              const content = (
                <>
                  <header>
                    <span>Trend #{String(idx + 1).padStart(2, '0')}</span>
                    <time>{getTimestamp(trend)}</time>
                  </header>
                  <h3>{trend.title || trend.topic}</h3>
                  <p>{trend.summary}</p>
                  {renderSourceList(trend)}
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {storyUrl && (
                      <Link href={storyUrl} className="btn" onClick={(e) => e.stopPropagation()}>
                        View In-Depth Analysis
                      </Link>
                    )}
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn secondary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Read Original
                      </a>
                    )}
                  </div>
                </>
              );

              return (
                <article key={trend._id || `trend-${idx}`} className="observer-trending__card">
                  {content}
                </article>
              );
            })
          ) : (
            <p className="observer-trending__empty">
              Trending feed will populate automatically once the pipeline runs.
            </p>
          )}
        </div>
      </section>

      {topicalSections.map((section) => (
        <section key={section.id} id={section.id} className="observer-topic-section">
          <div className="observer-section-heading">
            <p>{section.label.toUpperCase()}</p>
            <div>
              <h2>{section.title}</h2>
              <small>{section.subtitle}</small>
            </div>
            {ingestionStatus?.counters && (
              <span className="observer-status observer-status--muted">
                {section.stories.length
                  ? `Updated ${section.stories[0]?.generatedAt ? new Date(section.stories[0].generatedAt).toLocaleString() : 'recently'}`
                  : 'Awaiting fresh feed'}
              </span>
            )}
          </div>

          <div className="observer-topic-grid">
            {section.stories.length > 0 ? (
              section.stories.slice(0, 4).map((story) => (
                <NewsCard key={story._id} item={story}>
                  {renderCommentPreview(story)}
                  {renderCommentComposer(story)}
                </NewsCard>
              ))
            ) : (
              <p style={{ color: '#64748b', fontStyle: 'italic', gridColumn: '1 / -1', padding: '2rem' }}>
                No stories available in {section.label} category. News will appear here once the ingestion pipeline runs.
              </p>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
