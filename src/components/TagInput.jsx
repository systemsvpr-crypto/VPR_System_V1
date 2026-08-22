import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function TagInput({ value, onChange, placeholder, className }) {
  const [inputValue, setInputValue] = useState('');

  const tags = Array.isArray(value) ? value : [];

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inputValue.trim();
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
      }
      setInputValue('');
    }
  };

  const removeTag = (indexToRemove) => {
    onChange(tags.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="w-full">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-royal-50 text-royal-700 text-xs font-semibold ring-1 ring-royal-600/25">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(idx)}
                className="hover:bg-royal-200 rounded-full p-0.5 transition-colors focus:outline-none"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
