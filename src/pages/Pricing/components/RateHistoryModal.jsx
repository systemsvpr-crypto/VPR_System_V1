import { useState, useEffect } from 'react';
import { History, TrendingUp, Calendar, User, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { getGroupRateHistory } from '../../../services/pricingService';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '') return '—';
  return `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const RateHistoryModal = ({ isOpen, onClose, group }) => {
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
      <ModalContent className="max-w-2xl w-full">
        <ModalHeader>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-primary shrink-0 border border-blue-100">
            <History size={20} />
          </div>
          <div>
            <ModalTitle className="text-base font-semibold text-slate-800">
              Rate History — {group?.group_name || 'Product Group'}
            </ModalTitle>
            <p className="text-xs text-slate-500">
              Log of all rate updates and price changes recorded for this group
            </p>
            <ModalDescription className="sr-only">
              Rate history logs for {group?.group_name}
            </ModalDescription>
          </div>
        </ModalHeader>

        <ModalBody className="max-h-[60vh] overflow-y-auto p-4">
          {/* Current Active Rates Pill */}
          {group && (
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <TrendingUp size={14} className="text-primary" /> Current Active Rates:
              </span>
              <div className="flex items-center gap-4">
                <span className="text-slate-600">A: <strong className="text-slate-900">{formatRate(group.a_rate)}</strong></span>
                <span className="text-slate-600">B: <strong className="text-slate-900">{formatRate(group.b_rate)}</strong></span>
                <span className="text-slate-600">C: <strong className="text-slate-900">{formatRate(group.c_rate)}</strong></span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-xs text-slate-400">Loading history records...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <AlertCircle size={28} className="mx-auto text-slate-300 mb-2" />
              <h4 className="text-sm font-semibold text-slate-600 mb-1">No Historical Updates Recorded Yet</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Updates to A, B, or C rates made going forward will be automatically logged here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((record, index) => {
                const userName = record.user?.full_name || record.user?.username || 'System / Admin';
                const dateStr = record.created_at
                  ? format(new Date(record.created_at), 'dd MMM yyyy, hh:mm a')
                  : '—';

                return (
                  <div
                    key={record.history_id || index}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary/30 transition-all flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Clock size={13} className="text-slate-400" />
                        {dateStr}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                        <User size={11} className="text-slate-400" />
                        {userName}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2 bg-slate-50/80 rounded-lg border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Rate A</span>
                        <span className="font-semibold text-slate-800 text-sm">{formatRate(record.a_rate)}</span>
                      </div>
                      <div className="p-2 bg-slate-50/80 rounded-lg border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Rate B</span>
                        <span className="font-semibold text-slate-800 text-sm">{formatRate(record.b_rate)}</span>
                      </div>
                      <div className="p-2 bg-slate-50/80 rounded-lg border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Rate C</span>
                        <span className="font-semibold text-slate-800 text-sm">{formatRate(record.c_rate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" type="button" onClick={onClose} className="h-9 px-4 text-xs">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RateHistoryModal;
