import React, { useState, useEffect, useRef } from 'react';

interface InputModalProps {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  /** If provided, renders a <select> instead of a text input */
  options?: { value: string; label: string }[];
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const InputModal: React.FC<InputModalProps> = ({
  title,
  placeholder = '',
  defaultValue = '',
  options,
  confirmLabel = 'OK',
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select text on open
    if (!options) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [options]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9998]" onClick={onCancel}>
      <div
        className="bg-dark-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-gray-200 mb-3">{title}</p>

        {options ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-brand-500 text-sm"
            autoFocus
          >
            <option value="">— root (no folder) —</option>
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-md text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 text-sm"
          />
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 bg-dark-800 hover:bg-dark-700 border border-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-3 py-1.5 text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-md transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
