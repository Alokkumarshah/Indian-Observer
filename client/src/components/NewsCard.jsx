'use client';

import Link from 'next/link';

const NewsCard = ({ item, children }) => {
  const hasSources = Array.isArray(item.sourceOptions) && item.sourceOptions.length > 0;
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
      {hasSources && (
        <div className="news-card__sources">
          <p className="news-card__sources-title">Source options</p>
          <ul>
            {item.sourceOptions.map((option) => (
              <li key={`${item._id}-${option.link || option.title}`}>
                <span>{option.source || 'Unknown outlet'}</span>
                {option.link && (
                  <a href={option.link} target="_blank" rel="noreferrer">
                    Read article
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {storyHref && (
        <div style={{ marginTop: '0.75rem' }}>
          <Link href={storyHref} className="related-card__cta">
            Read the Observer summary →
          </Link>
        </div>
      )}
      {children && <div className="news-card__actions">{children}</div>}
    </article>
  );
};

export default NewsCard;

