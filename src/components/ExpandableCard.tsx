import { ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { FormattedArticleContent } from './FormattedArticleContent';

interface ExpandableCardProps {
  title: string;
  meta: ReactNode;
  preview: string;
  content?: string;
  loadContent?: () => Promise<string>;
  footer?: ReactNode;
  externalUrl?: string;
  externalLabel?: string;
  className?: string;
  unread?: boolean;
  onRead?: () => void;
}

export function ExpandableCard({
  title,
  meta,
  preview,
  content,
  loadContent,
  footer,
  externalUrl,
  externalLabel = 'Open original',
  className,
  unread = false,
  onRead
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadedContent, setLoadedContent] = useState<string | null>(content ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentId = useId();

  useEffect(() => {
    if (content !== undefined) {
      setLoadedContent(content);
    }
  }, [content]);

  async function toggleExpanded(): Promise<void> {
    const shouldExpand = !expanded;
    setExpanded(shouldExpand);
    if (shouldExpand) onRead?.();

    if (!shouldExpand || loadedContent || !loadContent || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setLoadedContent(await loadContent());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the full article.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article className={`update-card${expanded ? ' update-card--expanded' : ''}${unread ? ' update-card--unread' : ''}${className ? ` ${className}` : ''}`}>
      <div className="update-card__meta">
        {unread && <span className="update-card__unread" aria-label="Unread update" title="New update" />}
        {meta}
      </div>
      <h3>{title}</h3>

      <div id={contentId} className="expandable-card__body">
        {expanded ? (
          <>
            {isLoading && (
              <div className="inline-loading">
                <RefreshCw size={16} className="spin" aria-hidden="true" />
                Loading full article...
              </div>
            )}
            {error && <p className="inline-error">{error}</p>}
            {!isLoading && !error && (
              <FormattedArticleContent content={loadedContent ?? preview} />
            )}
          </>
        ) : (
          <p className="expandable-card__content expandable-card__content--collapsed">{preview}</p>
        )}
      </div>

      {footer}

      <div className="card-actions">
        <button
          type="button"
          className="card-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => void toggleExpanded()}
        >
          {expanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
          {expanded ? 'Close' : 'Read'}
        </button>

        {externalUrl && (
          <a
            className="details-link"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              onRead?.();
              handleExternalLink(event, externalUrl);
            }}
          >
            {externalLabel} <ExternalLink size={15} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  if (!window.__TAURI_INTERNALS__) {
    return;
  }

  event.preventDefault();
  void openExternalUrl(url).catch((error) => {
    console.error('Could not open the link in the default browser.', error);
  });
}
