import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

/**
 * CustomDropdown Component
 * A custom select component without search functionality.
 * Supports full keyboard accessibility (arrows, enter, escape, tab).
 * 
 * @param {Array} options - Array of { value, label } objects.
 * @param {any} value - Currently selected value.
 * @param {Function} onChange - Callback function when an option is selected.
 * @param {string} placeholder - Text to show when no value is selected.
 * @param {string} className - Additional CSS classes for the container.
 */
const CustomDropdown = ({ 
  options, 
  value, 
  onChange, 
  onAdd, 
  placeholder = "Select option...", 
  className = "",
  height = "h-[30px] md:h-[34px]",
  rounded = "rounded",
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const allOptions = options;
  const selectedOption = allOptions.find(opt => String(opt.value).toLowerCase().trim() === String(value || '').toLowerCase().trim());

  const hasAddButton = !!onAdd;
  const totalItemCount = allOptions.length + (hasAddButton ? 1 : 0);

  // Initialize/reset focusedIndex when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      const idx = allOptions.findIndex(opt => opt.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, value]);

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
      if (focusedIndex < allOptions.length && listRef.current) {
        const activeEl = listRef.current.children[focusedIndex];
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }, [focusedIndex, isOpen, allOptions.length]);

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
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };



  const handleBlur = (e) => {
    // If focus leaves the dropdown wrapper container, close the dropdown
    if (dropdownRef.current && !dropdownRef.current.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex(prev => (prev + 1) % totalItemCount);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex(prev => (prev - 1 + totalItemCount) % totalItemCount);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen) {
          if (focusedIndex >= 0 && focusedIndex < allOptions.length) {
            onChange(allOptions[focusedIndex].value);
            setIsOpen(false);
            if (triggerRef.current) triggerRef.current.focus();
          } else if (focusedIndex === allOptions.length && onAdd) {
            onAdd();
            setIsOpen(false);
            if (triggerRef.current) triggerRef.current.focus();
          }
        } else {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          if (triggerRef.current) triggerRef.current.focus();
        }
        break;
      case 'Tab':
        if (isOpen) {
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
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full bg-white ring-1 ring-royal-600/30 ${rounded} px-2 py-1 flex justify-between items-center cursor-pointer hover:ring-royal-500/40 hover:bg-white transition-all ${height} group outline-none focus:ring-2 focus:ring-royal-500/30 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={`text-xs truncate ${((selectedOption && selectedOption.value !== '') || (value && value !== '')) ? 'text-ink-heading' : 'text-gray-400 font-medium'}`}>
          {selectedOption && selectedOption.value !== '' ? selectedOption.label : (value || placeholder)}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 group-hover:text-royal-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`aidash-menu-in absolute left-0 right-0 ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} aidash-glass-solid bg-white/95 rounded-2xl shadow-glass-hover z-[150] overflow-hidden min-w-[180px]`}>

          {/* Options List */}
          <div className="max-h-40 overflow-y-auto py-1 scrollbar-hide" ref={listRef}>
            {allOptions.length > 0 ? (
              allOptions.map((opt, idx) => (
                <div
                  key={opt.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-1.5 text-xs cursor-pointer flex justify-between items-center transition-colors group ${
                    value === opt.value
                      ? 'bg-royal-50/70 text-royal-700 font-semibold'
                      : 'text-gray-700'
                  } ${
                    focusedIndex === idx
                      ? 'bg-royal-100 text-royal-900 font-bold'
                      : 'hover:bg-royal-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && (
                    <Check size={12} className="text-royal-600 flex-shrink-0" />
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-center text-gray-400 italic font-medium uppercase tracking-tight">
                No options available
              </div>
            )}
          </div>

          {/* Always visible Add New at the bottom */}
          {onAdd && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
                setIsOpen(false);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
                setIsOpen(false);
              }}
              className={`w-full border-t border-royal-600/25 px-3 py-2 text-royal-600 transition-all flex items-center justify-center gap-2 active:bg-royal-100 ${
                focusedIndex === allOptions.length
                  ? 'bg-royal-100 font-bold'
                  : 'hover:bg-royal-50'
              }`}
            >
              <Plus size={14} strokeWidth={3} />
              <span className="text-[10px] font-black uppercase tracking-widest">Add New</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
