import { t } from '../i18n';
import type { ArticleBlock, ArticleContent } from '../articles/types';
import { ArticleMediaGallery } from '../articles/ArticleMediaGallery';
interface FormattedArticleContentProps {
  content: ArticleContent;
}

const SECTION_HEADING = /^(important build info|audience(?: & server details)?|server info|testing\/feedback focus|known issues|feature updates|features and gameplay|gameplay|ships? & vehicles?|weapons? & items?|core tech & audio|bug fixes(?: & technical(?: updates)?)?|technical details|technical)$/i;
const UPDATE_HEADING = /^\[\d{4}-\d{2}-\d{2} updates\]$/i;
const MARKED_HEADING = /^#{1,4}\s+(.+)$/;
const BULLET_PREFIX = /^(?:[►➣•*-]|->)\s*/;
const DETAIL_ROW = /^(Patch should now show|Audience|Server Info|Long Term Persistence):\s*(.+)$/i;
const LIST_SECTION_HEADING = /^(testing\/feedback focus|known issues|feature updates|features and gameplay|gameplay|locations|ships? & vehicles?|weapons? & items?|core tech & audio|bug fixes(?: & technical(?: updates)?)?|technical details|technical)$/i;

export function FormattedArticleContent({ content }: FormattedArticleContentProps) {
  const blocks = typeof content === 'string' ? [{kind: 'text' as const, text: content}]
    : content.blocks ?? [{kind: 'text' as const, text: content.text}, ...content.media.map(media => ({kind: 'media' as const, media}))];
  const lines = blocks.flatMap<ArticleBlock>(block => block.kind === 'media' ? [block] : block.text
    .replace(/\r\n/g, '\n').split('\n')
    .map(line => line.replace(/\s+$/g, ''))
    .filter((line, index, values) => line.trim() || values[index - 1]?.trim())
    .map(text => ({kind: 'text' as const, text})));

  let listSection = false;

  return (
    <div className="article-content">
      {lines.map((block, index) => {
        if (block.kind === 'media') return <ArticleMediaGallery key={index} media={[block.media]} />;
        const rawLine = block.text;
        const line = rawLine.trim();
        if (!line) {
          return <div className="article-content__space" key={`space-${index}`} aria-hidden="true" />;
        }

        if (UPDATE_HEADING.test(line)) {
          return <h4 className="article-content__update-heading" key={index}>{line}</h4>;
        }

        const markedHeading = line.match(MARKED_HEADING);
        if (markedHeading) {
          listSection = false;
          return <h4 key={index}>{markedHeading[1]}</h4>;
        }

        if (isSectionHeading(line)) {
          listSection = LIST_SECTION_HEADING.test(line.replace(/:$/, ''));
          return <h4 key={index}>{line.replace(/:$/, '')}</h4>;
        }

        const detail = line.match(DETAIL_ROW);
        if (detail) {
          return (
            <div className="article-content__detail" key={index}>
              <span>{detail[1]}</span>
              <strong>{detail[2]}</strong>
            </div>
          );
        }

        if (BULLET_PREFIX.test(line) || listSection) {
          const indentation = Math.min(3, Math.floor((rawLine.length - rawLine.trimStart().length) / 2));
          return (
            <div className={`article-content__bullet article-content__bullet--depth-${indentation}`} key={index}>
              <span aria-hidden="true">•</span>
              <span>{line.replace(BULLET_PREFIX, '')}</span>
            </div>
          );
        }

        if (/^\d{4}\s+UTC\s+-/i.test(line)) {
          return <p className="article-content__update" key={index}>{line}</p>;
        }

        return <p key={index}>{line}</p>;
      })}
      {typeof content !== 'string' && !!content.unpositionedMedia?.length && <section><h4>{t('Additional article media')}</h4><ArticleMediaGallery media={content.unpositionedMedia} /></section>}
    </div>
  );
}

function isSectionHeading(line: string): boolean {
  if (SECTION_HEADING.test(line.replace(/:$/, ''))) {
    return true;
  }

  return line.endsWith(':') && line.length <= 72 && !/[.!?]\s*$/.test(line.slice(0, -1));
}
