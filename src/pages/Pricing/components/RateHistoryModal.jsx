import { useState, useEffect } from 'react';
import { History, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { getGroupRateHistory } from '../../../services/pricingService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '') return '—';
  return `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format timestamp in Indian Standard Time (IST)
 * Returns { date: 'DD/MM/YYYY', time: 'hh:mm AM/PM IST', full: 'DD/MM/YYYY, hh:mm AM/PM IST' }
 */
const getISTDateTime = (dateStr) => {
  if (!dateStr) return { date: '—', time: '', full: '—' };
  try {
    let s = typeof dateStr === 'string' ? dateStr.trim() : String(dateStr);
    if (!s) return { date: '—', time: '', full: '—' };

    // If string lacks timezone information (e.g. Postgres timestamp without time zone),
    // append 'Z' so it is parsed as UTC before converting to IST.
    if (!s.includes('Z') && !s.includes('+') && !/-\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return { date: dateStr, time: '', full: dateStr };

    const datePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);

    const timePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

    return {
      date: datePart,
      time: `${timePart} IST`,
      full: `${datePart}, ${timePart} IST`,
    };
  } catch {
    return { date: dateStr, time: '', full: dateStr };
  }
};

/**
 * Format purchase date in IST format (DD/MM/YYYY)
 */
const formatISTDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  dateStr = dateStr.trim();
  if (!dateStr) return null;

  if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(dateStr)) {
    return dateStr.replace(/-/g, '/');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    let s = dateStr;
    if (!s.includes('Z') && !s.includes('+') && !/-\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(parsed);
    }
  } catch {
    // fallback
  }
  return dateStr;
};

const RateHistoryModal = ({ isOpen, onClose, group, ranks = [] }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && group?.group_id) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [isOpen, group?.group_id]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await getGroupRateHistory(group.group_id);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent className="w-[94vw] sm:w-full max-w-lg sm:max-w-xl p-0 overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 shadow-xl">
        {/* Compact Modal Header */}
        <ModalHeader className="px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 pr-7">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center text-primary shrink-0 border border-blue-100">
              <History size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <ModalTitle className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                  Rate History
                </ModalTitle>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shrink-0">
                  {history.length} {history.length === 1 ? 'record' : 'records'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate font-medium">
                {group?.group_name || 'Product Group'}
              </p>
              <ModalDescription className="sr-only">
                Rate history logs for {group?.group_name} in IST format
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="max-h-[60vh] sm:max-h-[68vh] overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-2.5">
          {/* Active Rates Summary Pill */}
          {group && (
            <div className="p-2 sm:p-2.5 bg-slate-50/90 border border-slate-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 text-[11px]">
                <TrendingUp size={13} className="text-emerald-600" /> Current Rates:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ranks && ranks.length > 0 ? (
                  ranks.map((r) => {
                    const rateVal = group.rank_rates?.[r.rank_name] ?? (
                      r.rank_name === 'A' ? group.a_rate :
                      r.rank_name === 'B' ? group.b_rate :
                      r.rank_name === 'C' ? group.c_rate : null
                    );
                    return (
                      <span
                        key={r.rank_id || r.rank_name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-700 font-medium shadow-2xs"
                      >
                        <span className="text-slate-400 font-bold">{r.rank_name}</span>
                        <strong className="text-slate-900">{formatRate(rateVal)}</strong>
                      </span>
                    );
                  })
                ) : (
                  Object.entries(group.rank_rates || {}).map(([key, val]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-700 font-medium shadow-2xs"
                    >
                      <span className="text-slate-400 font-bold">{key}</span>
                      <strong className="text-slate-900">{formatRate(val)}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-xs text-slate-400">Loading history records...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              <AlertCircle size={22} className="mx-auto text-slate-300 mb-1.5" />
              <h4 className="text-xs font-semibold text-slate-700 mb-0.5">No Rate History Recorded Yet</h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Any updates made to rank rates will be automatically tracked in IST time format here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((record, index) => {
                const timestamp = record.created_at || record.updated_at;
                const ist = getISTDateTime(timestamp);

                const ratesObj = (typeof record.rank_rates === 'object' && record.rank_rates !== null)
                  ? record.rank_rates
                  : (typeof record.rank_rates === 'string' ? (() => { try { return JSON.parse(record.rank_rates); } catch { return {}; } })() : {
                      ...(record.a_rate !== undefined ? { A: record.a_rate } : {}),
                      ...(record.b_rate !== undefined ? { B: record.b_rate } : {}),
                      ...(record.c_rate !== undefined ? { C: record.c_rate } : {}),
                    });

                const entries = ranks && ranks.length > 0
                  ? ranks.map(r => [r.rank_name, ratesObj[r.rank_name]])
                  : Object.entries(ratesObj);

                return (
                  <div
                    key={record.id || index}
                    className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors shadow-2xs space-y-2"
                  >
                    {/* Header: Date + IST Time Badge + Log ID & Last purchase */}
                    <div className="flex items-center justify-between text-xs gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <div className="flex items-center gap-1 text-slate-800 font-semibold text-[11.5px] sm:text-xs">
                          <Clock size={12} className="text-primary shrink-0" />
                          <span>{ist.date}</span>
                        </div>
                        {ist.time && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100/80">
                            {ist.time}
                          </span>
                        )}
                      </div>

                      {record.last_purchase && (
                        <div className="flex items-center gap-1.5 text-[10px] ml-auto">
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 font-medium whitespace-nowrap">
                            Last Pur: {formatISTDate(record.last_purchase)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rates Grid: Compact and responsive */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {entries.map(([rName, rVal]) => (
                        <div
                          key={rName}
                          className="px-2 py-1 bg-slate-50/80 rounded border border-slate-100 flex items-center justify-between gap-1 text-[11px]"
                        >
                          <span className="text-[10px] text-slate-400 uppercase font-bold">
                            {rName}
                          </span>
                          <span className="font-bold text-slate-800 tabular-nums">
                            {formatRate(rVal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="px-3.5 sm:px-4 py-2 sm:py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10.5px] text-slate-400 font-medium hidden xs:inline-block">
            All timestamps recorded in Indian Standard Time (IST)
          </span>
          <Button variant="outline" type="button" onClick={onClose} className="h-7.5 sm:h-8 px-3.5 text-xs ml-auto">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RateHistoryModal;

