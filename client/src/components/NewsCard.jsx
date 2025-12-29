'use client';

import Link from 'next/link';

const NewsCard = ({ item, children }) => {
  const storyHref = item._id ? `/story/${item._id}` : null;

  return (
    <article className="news-card">
      <header className="news-card__header">
        <div>
          {storyHref ? (
            <Link href={storyHref}>
              <h3>{item.title || item.topic}</h3>
            </Link>
          ) : (
            <h3>{item.title || item.topic}</h3>
          )}
          {item.category && <small className="news-card__category">{item.category}</small>}
        </div>
        {item.publishedAt && <time>{new Date(item.publishedAt).toLocaleString()}</time>}
      </header>
      <p className="news-card__summary">{item.summary}</p>
      {(storyHref || item.externalUrl || item.primaryLink) && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {storyHref && (
            <Link href={storyHref} className="btn">
              View In-Depth Analysis
            </Link>
          )}
          {(item.externalUrl || item.primaryLink) && (
            <a
              href={item.externalUrl || item.primaryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
            >
              Read Original Article
            </a>
          )}
        </div>
      )}
      {children && <div className="news-card__actions">{children}</div>}
    </article>
  );
};

export default NewsCard;

