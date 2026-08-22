import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

/**
 * DateInput Component
 * A unified date input component that formats dates as DD/MM/YYYY
 * and automatically triggers the native browser date picker on focus (Tabbing/Clicking).
 */
const DateInput = ({ label, name, value, onChange, required, readOnly, minDate }) => {
  const dateInputRef = useRef(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const toYYYYMMDD = (val) => {
    if (!val) return '';
    const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return val;
  };

  const toDDMMYYYY = (val) => {
    if (!val) return '';
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return val;
  };

  const handleDateChange = (e) => {
    const rawValue = e.target.value;
    if (!rawValue) return;
    const formatted = toDDMMYYYY(rawValue);
    onChange({ target: { name, value: formatted } });
  };

  const handleTextChange = (e) => {
    let val = e.target.value;
    onChange({ target: { name, value: val } });
  };

  const openDatePicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === 'function') {
        try {
          dateInputRef.current.showPicker();
        } catch (e) {
          dateInputRef.current.click();
        }
      } else {
        dateInputRef.current.click();
      }
    }
  };



  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {readOnly ? (
        <div className="relative flex items-center">
          <input
            readOnly
            type="text"
            name={name}
            placeholder="DD/MM/YYYY"
            value={value || ''}
            className="w-full p-2 pr-10 bg-gray-100/70 ring-1 ring-royal-600/25 rounded-xl outline-none text-xs text-gray-500 cursor-not-allowed select-none"
          />
          <div className="absolute right-2.5 text-gray-300 pointer-events-none">
            <Calendar size={14} />
          </div>
        </div>
      ) : isTouch ? (
        <div className="relative flex items-center">
          {/* Visible Text Input - ALWAYS displays DD/MM/YYYY */}
          <input
            readOnly
            required={required}
            type="text"
            placeholder="DD/MM/YYYY"
            value={value || ''}
            className="w-full p-2 pr-10 bg-white/60 ring-1 ring-royal-600/25 rounded-xl outline-none text-xs cursor-pointer"
          />
          
          {/* Calendar Icon Button */}
          <div className="absolute right-2.5 text-gray-400 pointer-events-none">
            <Calendar size={14} />
          </div>

          {/* Overlaid Native Date Input */}
          <input
            required={required}
            type="date"
            max="9999-12-31"
            value={toYYYYMMDD(value)}
            min={toYYYYMMDD(minDate)}
            onChange={handleDateChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      ) : (
        <div className="relative flex items-center cursor-pointer" onClick={openDatePicker}>
          {/* Visible Text Input - ALWAYS displays DD/MM/YYYY */}
          <input
            required={required}
            type="text"
            name={name}
            placeholder="DD/MM/YYYY"
            value={value || ''}
            onChange={handleTextChange}
            className="w-full p-2 pr-10 bg-white/60 ring-1 ring-royal-600/25 rounded-xl focus:ring-2 focus:ring-royal-500/40 focus:bg-white outline-none text-xs transition-all"
          />
          
          {/* Calendar Icon Button */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); openDatePicker(); }}
            className="absolute right-2.5 text-gray-400 hover:text-blue-500 transition-colors"
            title="Choose Date"
          >
            <Calendar size={14} />
          </button>

          {/* Hidden Native Date Input */}
          <input
            ref={dateInputRef}
            type="date"
            max="9999-12-31"
            value={toYYYYMMDD(value)}
            min={toYYYYMMDD(minDate)}
            onChange={handleDateChange}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 w-full h-[1px] opacity-0 pointer-events-none"
          />
        </div>
      )}
    </div>
  );
};

export default DateInput;
