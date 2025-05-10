// Content type definitions
type ContentType = 'section' | 'subsection' | 'list' | 'paragraph' | 'citation' | 'code' | 'quote';

interface ContentNode {
  type: ContentType;
  content: string;
  children?: ContentNode[];
  metadata?: {
    level?: number;
    isNested?: boolean;
    hasPrefix?: boolean;
  };
}

// Formatting configuration
const formattingConfig = {
  section: {
    prefix: '\n## ',
    suffix: '\n\n',
    indent: 0,
    maxLength: 100
  },
  subsection: {
    prefix: '\n### ',
    suffix: '\n\n',
    indent: 2,
    maxLength: 80
  },
  list: {
    prefix: '- ',
    suffix: '\n',
    indent: 4,
    maxLength: 120
  },
  paragraph: {
    prefix: '',
    suffix: '\n\n',
    indent: 0,
    maxLength: 80
  },
  citation: {
    prefix: '> ',
    suffix: '\n',
    indent: 2,
    maxLength: 100
  },
  code: {
    prefix: '```\n',
    suffix: '\n```\n',
    indent: 0,
    maxLength: 1000
  },
  quote: {
    prefix: '> ',
    suffix: '\n',
    indent: 2,
    maxLength: 100
  }
};

// Content parsing utilities
function detectContentType(text: string): ContentType {
  if (text.match(/^\d+\./)) return 'section';
  if (text.match(/^[*-]/)) return 'list';
  if (text.match(/^>/)) return 'citation';
  if (text.match(/^```/)) return 'code';
  if (text.match(/^\*\*[^*]+\*\*:/)) return 'subsection';
  return 'paragraph';
}

function splitIntoSections(text: string): string[] {
  return text
    .split(/(?=\d+\.\s+)/)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
}

function parseContentNode(text: string, level: number = 0): ContentNode {
  const type = detectContentType(text);
  const lines = text.split('\n');
  
  switch (type) {
    case 'section':
      return {
        type,
        content: lines[0].replace(/^\d+\.\s*/, ''),
        children: lines.slice(1).map(line => parseContentNode(line, level + 1)),
        metadata: { level }
      };
    
    case 'list':
      return {
        type,
        content: lines.map(line => line.replace(/^[*-]\s*/, '')).join('\n'),
        metadata: { level, isNested: level > 0 }
      };
    
    case 'subsection':
      return {
        type,
        content: lines[0].replace(/^\*\*|\*\*:$/g, ''),
        children: lines.slice(1).map(line => parseContentNode(line, level + 1)),
        metadata: { level }
      };
    
    default:
      return {
        type,
        content: text,
        metadata: { level }
      };
  }
}

// Formatting utilities
function formatContentNode(node: ContentNode): string {
  const config = formattingConfig[node.type];
  const indent = ' '.repeat(config.indent + (node.metadata?.level || 0) * 2);
  
  let formattedContent = node.content;
  
  switch (node.type) {
    case 'section':
    case 'subsection':
      formattedContent = `${config.prefix}${formattedContent}${config.suffix}`;
      if (node.children) {
        formattedContent += node.children
          .map(child => formatContentNode(child))
          .join('');
      }
      break;
    
    case 'list':
      formattedContent = formattedContent
        .split('\n')
        .map(line => `${indent}${config.prefix}${line}${config.suffix}`)
        .join('');
      break;
    
    case 'citation':
      formattedContent = `${indent}${config.prefix}${formattedContent}${config.suffix}`;
      break;
    
    default:
      formattedContent = `${indent}${formattedContent}${config.suffix}`;
  }
  
  return formattedContent;
}

// Main formatting function
export function formatMarkdown(text: string): string {
  // Split into sections and parse
  const sections = text.split(/(?=##\s+)/);
  const parsedContent = sections.map(section => {
    const lines = section.split('\n');
    const header = lines[0];
    const content = lines.slice(1).join('\n');
    
    return {
      type: 'section' as ContentType,
      content: header,
      children: content.split(/(?=^-\s+)/m).map(item => {
        const trimmed = item.trim();
        if (trimmed.startsWith('**') && trimmed.includes(':**')) {
          return {
            type: 'subsection' as ContentType,
            content: trimmed,
            metadata: { level: 1 }
          };
        }
        return {
          type: 'list' as ContentType,
          content: trimmed,
          metadata: { level: 0 }
        };
      })
    };
  });
  
  // Format each section
  const formattedContent = parsedContent
    .map(node => formatContentNode(node))
    .join('\n');
  
  // Apply final cleanup
  return formattedContent
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/gm, '')
    .trim();
}

// Link and citation formatting
export function formatLinks(text: string): string {
  return text
    // Normalize broken link spacing
    .replace(/https:\s*\/\//g, 'https://')
    .replace(/http:\s*\/\//g, 'http://')
    .replace(/(?<=\])\s*\(\s*/g, '(')
    .replace(/\s*\)(?=\s|$)/g, ')')
    
    // Fix malformed markdown links
    .replace(/\[\s*([^\]]+?)\s*\]\s*\(\s*(https?:\/\/[^)]+?)\s*\)/g, '[$1]($2)')
    .replace(/\[([^\]]+?)\]\((?!https?:\/\/)([^)]+?)\)/g, (_, label, url) => {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      return `[${label}](${fullUrl})`;
    })
    
    // Normalize PubMed citations
    .replace(/\(\[([^\]]+?)\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,})\)\)/gi, (_, label, pmid) => {
      return `([${label}](https://pubmed.ncbi.nlm.nih.gov/${pmid}))`;
    })
    .replace(/(?<!\()(\[.*?\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\))(?!\))/g, '($1)')
    .replace(/PMID:\s*(\d+)(?!\s*\(\[)/g, (_, pmid) => {
      return `PMID: ${pmid} ([PubMed](https://pubmed.ncbi.nlm.nih.gov/${pmid}))`;
    });
}

// Text formatting
export function formatText(text: string): string {
  return text
    // Fix bold and italic formatting
    .replace(/\*\*\s*(.+?)\s*:\s*\*\*/g, '**$1:**')
    .replace(/\*\*\s*(.+?)\s*\*\*/g, '**$1**')
    .replace(/\*\s*(.+?)\s*\*/g, '*$1*')
    .replace(/(\*\*[^\*]+?\*\*)(?=\S)/g, '$1 ')
    .replace(/(\*[^\*]+?\*)(?=\S)/g, '$1 ')
    
    // Fix spacing around punctuation
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/([,.:;!?])(?=\S)/g, '$1 ')
    
    // Fix multiple spaces
    .replace(/\s{2,}/g, ' ')
    
    // Fix newlines
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/gm, '')
    .trim();
}

// Replace the processMarkdown function with a simpler version
export function processMarkdown(text: string): string {
  return text
    // Add smart typography
    .replace(/(\w)'(\w)/g, "$1'$2")  // Smart quotes
    .replace(/--/g, "—")  // Em dashes
    .replace(/\.\.\./g, "…")  // Ellipsis
    
    // Add GitHub Flavored Markdown features
    .replace(/~~(.*?)~~/g, "<del>$1</del>")  // Strikethrough
    .replace(/`{3}([\s\S]*?)`{3}/g, "<pre><code>$1</code></pre>")  // Code blocks
    .replace(/`([^`]+)`/g, "<code>$1</code>")  // Inline code
    
    // Add heading IDs
    .replace(/^(#{1,6})\s+(.+)$/gm, (match, level, text) => {
      const id = text.toLowerCase().replace(/[^\w]+/g, "-");
      return `${level} <span id="${id}">${text}</span>`;
    });
}

// Update cleanMarkdown to be synchronous
export function cleanMarkdown(text: string): string {
  // First clean the text with our existing rules
  const cleaned = text
    // 1. Normalize broken link spacing: https: // → https://
    .replace(/https:\s*\/\//g, 'https://')

    // 2. Fix malformed markdown links: [Label] (https://...) → [Label](https://...)
    .replace(/\[\s*([^\]]+?)\s*\]\(\s*https:\/\/\s*([^)]+?)\)/g, '[$1](https://$2)')

    // 3. Convert [Label](https://pubmed...) to (Label) with hyperlink
    .replace(
      /\(\[([^\]]+?)\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,})\)\)/gi,
      (_m, label, pmid) =>
        `([${label}](https://pubmed.ncbi.nlm.nih.gov/${pmid}))`
    )

    // 4. Ensure PubMed links are wrapped in parens if not already
    .replace(
      /(?<!\()(\[.*?\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\))(?!\))/g,
      '($1)'
    )

    // 5. Hide raw PMID lines
    .replace(/^PMID:\s*\d+\s*/gm, '')

    // 6. Fix bold headers: **Label: ** → **Label:** (handles extra spaces/variant colons)
    .replace(/\*\*\s*([^*]+?)\s*[:：]?\s*\*\*/g, '**$1:**')

    // 7. Ensure a space after any bold block
    .replace(/(\*\*[^\*]+?\*\*)(?=\S)/g, '$1 ')

    // 8. Normalize ANY "1. Title" variant (with or without **…**, with stray *'s, etc.) into a ### heading
    .replace(
      /^\s*(?:\*+|-+)?\s*(\d+)\.\s*(.+?):?\s*(?:\*+)?\s*$/gm,
      '\n\n### $1. $2\n'
    )

    // 9. Turn GPT-style bullets "* Label:" or "- Label:" into "- **Label:** "
    .replace(/^\s*[-*]\s*(.+?):\s*/gm, (_m, label) => `- **${label.trim()}:** `)
    
    // 10. Fallback: clean any remaining lone bullets into "- "
    .replace(/^\s*[-*]\s+/gm, '- ')

    // ────────────────────────────────────────────────────────

    // 11. Remove newline between bullet and its text
    .replace(/-\s*\n\s*/g, '- ')

    // 12. Add blank line before headings like ### or ##
    .replace(/(?<!\n)\s*(#+\s+)/g, '\n\n$1')

    // 13. Normalize extra newlines
    .replace(/\n{3,}/g, '\n\n')

    // 14. Strip trailing parentheses-only junk
    .replace(/(\(\s*.+?\s*\)\s*)+$/, '')

    // 15. Trim leading/trailing whitespace
    .trim();

  // Then process with our simplified markdown processor
  return processMarkdown(cleaned);
}