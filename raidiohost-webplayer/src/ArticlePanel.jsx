import './ArticlePanel.css';

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function ArticlePanel({ articles = [], isOpen, onToggle }) {
  return (
    <>
      <button
        type="button"
        className="article-panel-toggle"
        onClick={onToggle}
        aria-label={isOpen ? 'Hide article sources' : 'Show article sources'}
        title={isOpen ? 'Hide sources' : 'Show sources'}
      >
        <span className="article-panel-toggle-label">Sources</span>
        <span className="article-panel-toggle-chevron" aria-hidden="true">
          {isOpen ? '›' : '‹'}
        </span>
      </button>

      <aside
        className={`article-panel${isOpen ? ' article-panel--open' : ''}`}
        aria-label="Article sources"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="article-panel-header">
          <h2 className="article-panel-heading">Article Sources</h2>
          <button
            type="button"
            className="article-panel-close"
            onClick={onToggle}
            aria-label="Close article sources panel"
          >
            ✕
          </button>
        </div>

        {articles.length === 0 ? (
          <p className="article-panel-empty">
            No articles yet — they&apos;ll appear after your first blurb.
          </p>
        ) : (
          <ul className="article-panel-list">
            {articles.map((article) => {
              const hostname = getHostname(article.url) || getHostname(article.sourceUrl);
              return (
                <li key={article.url} className="article-panel-item">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="article-panel-link"
                  >
                    <span className="article-panel-title">{article.title}</span>
                    {hostname && (
                      <span className="article-panel-source">{hostname}</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </>
  );
}
