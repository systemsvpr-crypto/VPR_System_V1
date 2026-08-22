import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Plus, Square, CheckSquare } from 'lucide-react';

/**
 * SearchableDropdown Component
 * A custom select component with built-in search functionality.
 * Supports full keyboard accessibility (arrows, enter, escape, tab).
 * 
 * @param {Array} options - Array of { value, label } objects.
 * @param {any} value - Currently selected value.
 * @param {Function} onChange - Callback function when an option is selected.
 * @param {string} placeholder - Text to show when no value is selected.
 * @param {string} className - Additional CSS classes for the container.
 */
const SearchableDropdown = ({ 
  options, 
  value, 
  onChange, 
  onAdd, 
  placeholder = "Select option...", 
  className = "",
  height = "h-[30px] md:h-[34px]",
  rounded = "rounded",
  isMulti = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  const allOptions = isMulti ? options : [{ value: '', label: placeholder }, ...options];

  // Filter options based on search term
  const filteredOptions = allOptions.filter(opt =>
    String(opt?.label || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Find the label for the current value
  const selectedOption = allOptions.find(opt => String(opt.value).toLowerCase().trim() === String(value || '').toLowerCase().trim());
  const selectedOptions = isMulti && Array.isArray(value) ? allOptions.filter(opt => value.map(v => String(v).toLowerCase().trim()).includes(String(opt.value).toLowerCase().trim())) : [];
  
  const getTriggerText = () => {
    if (isMulti) {
      if (!value || value.length === 0) return placeholder;
      if (value.length === 1) return selectedOptions[0]?.label || placeholder;
      return `${value.length} Selected`;
    }
    return selectedOption ? selectedOption.label : placeholder;
  };
  
  const isSelected = (optValue) => {
    if (isMulti) {
      if (optValue === '') return (!value || value.length === 0);
      return Array.isArray(value) && value.includes(optValue);
    }
    return value === optValue;
  };

  const hasAddButton = !!onAdd;
  const totalItemCount = filteredOptions.length + (hasAddButton ? 1 : 0);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Sync focused index with search query changes or value
  useEffect(() => {
    if (isOpen) {
      if (!isMulti && value) {
        const idx = filteredOptions.findIndex(opt => opt.value === value);
        setFocusedIndex(idx >= 0 ? idx : 0);
      } else {
        setFocusedIndex(0);
      }
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, searchTerm, value]);

  // Determine direction based on space
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      
      // Find closest scrollable ancestor
      let scrollParent = dropdownRef.current.parentElement;
      while (scrollParent && scrollParent !== document.body) {
        const style = window.getComputedStyle(scrollParent);
        if (['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow)) {
          break;
        }
        scrollParent = scrollParent.parentElement;
      }
      
      let spaceBelow, spaceAbove;
      const dropdownHeight = 300;
      
      if (scrollParent && scrollParent !== document.body) {
        const parentRect = scrollParent.getBoundingClientRect();
        spaceBelow = parentRect.bottom - rect.bottom;
        spaceAbove = rect.top - parentRect.top;
      } else {
        spaceBelow = window.innerHeight - rect.bottom;
        spaceAbove = rect.top;
      }

      // If there's not enough space below AND there is more space above, open upwards
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      if (focusedIndex < filteredOptions.length && listRef.current) {
        const activeEl = listRef.current.children[focusedIndex];
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }, [focusedIndex, isOpen, filteredOptions.length]);

  // Close dropdown when clicking/touching outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, []);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };



  const handleBlur = (e) => {
    // If focus leaves the dropdown wrapper container, close the dropdown
    if (dropdownRef.current && !dropdownRef.current.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (totalItemCount > 0) {
          setFocusedIndex(prev => (prev + 1) % totalItemCount);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (totalItemCount > 0) {
          setFocusedIndex(prev => (prev - 1 + totalItemCount) % totalItemCount);
        }
        break;
      case 'Enter':
        if (isOpen) {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
            const opt = filteredOptions[focusedIndex];
            if (isMulti) {
              if (opt.value === '') {
                onChange([]);
              } else {
                const currentVal = Array.isArray(value) ? value : [];
                if (currentVal.includes(opt.value)) {
                  onChange(currentVal.filter(v => v !== opt.value));
                } else {
                  onChange([...currentVal, opt.value]);
                }
              }
            } else {
              onChange(opt.value);
              setIsOpen(false);
              setSearchTerm("");
              if (triggerRef.current) triggerRef.current.focus();
            }
          } else if (focusedIndex === filteredOptions.length && onAdd) {
            onAdd();
            setIsOpen(false);
            if (triggerRef.current) triggerRef.current.focus();
          }
        } else {
          e.preventDefault();
          setIsOpen(true);
        }
        break;
      case ' ':
      case 'Space':
        // Only toggle if focus is not in the search input
        if (document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm("");
          if (triggerRef.current) triggerRef.current.focus();
        }
        break;
      case 'Tab':
        if (isOpen) {
          if (triggerRef.current) {
            triggerRef.current.focus();
          }
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div 
      className={`relative ${className}`} 
      ref={dropdownRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {/* Selection Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`w-full bg-white border border-gray-300 ${rounded} px-2 py-1 flex justify-between items-center cursor-pointer hover:border-royal-400 transition-all ${height} group outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20`}
      >
        <span className={`text-xs truncate ${(isMulti ? (value && value.length > 0) : (selectedOption && selectedOption.value !== '' || value)) ? 'text-ink-heading font-medium' : 'text-gray-400 font-medium'}`}>
          {getTriggerText()}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 group-hover:text-royal-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`aidash-menu-in absolute left-0 right-0 ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} aidash-glass-solid bg-white/95 rounded-2xl shadow-glass-hover z-[150] overflow-hidden min-w-[180px]`}>
          {/* Search Box */}
          <div className="p-1.5 border-b border-royal-600/25 flex gap-1.5 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-[7px] text-gray-400" size={10} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Filter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white ring-1 ring-royal-600/25 rounded-xl pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500/30"
              />
            </div>
            {onAdd && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAdd(searchTerm);
                  setIsOpen(false);
                }}

                className="flex items-center justify-center h-[26px] px-2 bg-royal-50 text-royal-700 rounded-xl ring-1 ring-royal-600/30 hover:bg-royal-100 transition-colors font-bold text-[10px] uppercase tracking-wider"
                title="Add New"
              >
                <Plus size={12} strokeWidth={3} className="mr-1" /> Add
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto py-1 scrollbar-hide" ref={listRef}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                <div
                  key={opt.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMulti) {
                      if (opt.value === '') {
                        onChange([]);
                      } else {
                        const currentVal = Array.isArray(value) ? value : [];
                        if (currentVal.includes(opt.value)) {
                          onChange(currentVal.filter(v => v !== opt.value));
                        } else {
                          onChange([...currentVal, opt.value]);
                        }
                      }
                    } else {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchTerm("");
                    }
                  }}
                  className={`px-3 py-1.5 text-xs cursor-pointer flex justify-between items-center transition-colors group ${
                    isSelected(opt.value) ? 'bg-royal-50/60' : ''
                  } ${
                    focusedIndex === idx
                      ? 'bg-royal-100 text-royal-900 font-bold'
                      : 'hover:bg-royal-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isMulti ? (
                      isSelected(opt.value) ? (
                        <CheckSquare size={14} className="text-royal-600 flex-shrink-0" />
                      ) : (
                        <Square size={14} className="text-gray-300 flex-shrink-0" />
                      )
                    ) : (
                      isSelected(opt.value) && (
                        <Check size={12} className="text-royal-600 flex-shrink-0" />
                      )
                    )}
                    <span className="truncate text-ink-heading font-medium">{opt.label}</span>
                  </div>
                  {opt.count !== undefined && (
                    <span className="text-gray-500 text-[10px] pl-2 font-medium shrink-0">
                      ({opt.count})
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-center text-gray-400 italic font-medium uppercase tracking-tight">
                No matching results found
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
