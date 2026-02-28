import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  return (
    <div className={className || undefined}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="text-base font-bold text-gray-100 mt-3 mb-1.5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold text-gray-100 mt-3 mb-1 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        code: ({ children, className: cls }) => {
          const isBlock = cls?.startsWith('language-');
          if (isBlock) {
            return (
              <code className="block text-xs font-mono text-green-300 whitespace-pre-wrap break-all">
                {children}
              </code>
            );
          }
          return (
            <code className="bg-gray-800 text-brand-300 px-1 py-0.5 rounded text-[0.85em] font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-gray-400 italic">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-100">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-300">{children}</em>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 underline underline-offset-2 hover:text-brand-300 transition-colors"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="border-gray-700 my-3" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-gray-700 px-2 py-1 text-left text-gray-300 font-semibold bg-gray-800">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-700 px-2 py-1 text-gray-400">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
};
