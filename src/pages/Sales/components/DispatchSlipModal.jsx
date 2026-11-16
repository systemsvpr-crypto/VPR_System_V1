import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  Building2,
  Calendar,
  User,
  PackageCheck,
  FileText,
  Filter,
} from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

/**
 * Isolated iframe print function to ensure 100% clean printing
 * with no modal clipping, transforms, or blank-space artifacts.
 */
const printSlipsToIframe = (slipsToPrint) => {
  if (!slipsToPrint || slipsToPrint.length === 0) return;

  let iframe = document.getElementById('dispatch-slip-print-iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'dispatch-slip-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
  }

  const slipsHtml = slipsToPrint
    .map((slip, index) => {
      const isLast = index === slipsToPrint.length - 1;
      return `
      <div class="dispatch-slip-page ${isLast ? 'last-page' : ''}">
        <div class="slip-card">
          <!-- Header -->
          <div class="slip-header">
            <div class="header-row">
              <div>
                <div class="company-tag">VPR SYSTEMS ENTERPRISE</div>
                <div class="doc-title">DISPATCH SLIP</div>
              </div>
              <div class="header-right">
                <span class="copy-badge">PARTY COPY</span>
                <div class="date-row">Date: <strong>${formatDisplayDate(slip.dispatchDate)}</strong></div>
              </div>
            </div>

            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-label">Party:</span>
                <strong class="party-name">${slip.partyName}</strong>
              </div>
              <div class="meta-item text-right">
                <span class="meta-label">Godown / Location:</span>
                <strong class="location-name">${slip.locationName}</strong>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 35px; text-align: left;">#</th>
                <th style="text-align: left;">Product Name / Description</th>
                <th style="width: 100px; text-align: center;">Order No</th>
                <th style="width: 70px; text-align: right;">Qty</th>
                <th style="width: 60px; text-align: center;">Unit</th>
              </tr>
            </thead>
            <tbody>
              ${slip.items
                .map(
                  (it, i) => `
                <tr>
                  <td class="col-idx">${i + 1}</td>
                  <td class="col-name">${it.productName}</td>
                  <td class="col-order text-center">${it.orderNumber || '—'}</td>
                  <td class="col-qty text-right"><strong>${it.quantity}</strong></td>
                  <td class="col-unit text-center">${it.unit}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="foot-label">Total Items: ${slip.items.length}</td>
                <td class="foot-qty text-right">${slip.totalQty}</td>
                <td class="foot-unit text-center">TOTAL</td>
              </tr>
            </tfoot>
          </table>

          <!-- Signatures -->
          <div class="signatures">
            <div class="sig-box">
              <div class="sig-line"></div>
              <span>Prepared By (Dispatch)</span>
            </div>
            <div class="sig-watermark">
              Generated via VPR Systems
            </div>
            <div class="sig-box text-right">
              <div class="sig-line right"></div>
              <span>Receiver's Sign & Date</span>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title></title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .dispatch-slip-page {
            padding: 12mm 14mm 16mm 14mm;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .dispatch-slip-page.last-page {
            page-break-after: auto;
            break-after: auto;
          }
          .slip-card {
            border: 1.5px solid #0f172a;
            border-radius: 8px;
            padding: 18px 22px;
            background: #ffffff;
          }
          .slip-header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .company-tag {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.8px;
            color: #475569;
            text-transform: uppercase;
          }
          .doc-title {
            font-size: 20px;
            font-weight: 900;
            letter-spacing: -0.5px;
            color: #0f172a;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .header-right {
            text-align: right;
          }
          .copy-badge {
            display: inline-block;
            padding: 3px 8px;
            background: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
            border-radius: 4px;
            text-transform: uppercase;
          }
          .date-row {
            font-size: 12px;
            color: #334155;
            margin-top: 4px;
            font-family: monospace;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .meta-item {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .meta-label {
            color: #64748b;
          }
          .party-name {
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
          }
          .location-name {
            font-weight: 700;
            color: #1e293b;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0 16px 0;
            font-size: 12px;
          }
          .items-table th {
            background: #f8fafc;
            border-bottom: 2px solid #cbd5e1;
            padding: 8px 10px;
            font-weight: 800;
            color: #334155;
            text-transform: uppercase;
            font-size: 11px;
          }
          .items-table td {
            padding: 7px 10px;
            border-bottom: 1px solid #e2e8f0;
            color: #1e293b;
          }
          .col-idx {
            color: #94a3b8;
            font-family: monospace;
            font-size: 11px;
          }
          .col-name {
            font-weight: 600;
          }
          .col-order {
            color: #64748b;
            font-family: monospace;
            font-size: 11px;
          }
          .col-qty {
            font-size: 13px;
          }
          .col-unit {
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            font-size: 11px;
          }
          .items-table tfoot td {
            background: #f8fafc;
            border-top: 2px solid #0f172a;
            padding: 8px 10px;
            font-weight: 800;
            color: #0f172a;
          }
          .foot-label {
            font-size: 12px;
          }
          .foot-qty {
            font-size: 14px;
            font-weight: 900;
          }
          .foot-unit {
            font-size: 11px;
            color: #475569;
          }
          .signatures {
            margin-top: 36px;
            padding-top: 12px;
            border-top: 1px dashed #cbd5e1;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 11px;
            color: #64748b;
          }
          .sig-box {
            display: flex;
            flex-direction: column;
          }
          .sig-line {
            width: 150px;
            border-bottom: 1.5px solid #64748b;
            margin-bottom: 4px;
          }
          .sig-line.right {
            margin-left: auto;
          }
          .sig-watermark {
            font-size: 10px;
            color: #94a3b8;
            font-family: monospace;
          }
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
        </style>
      </head>
      <body>
        ${slipsHtml}
      </body>
    </html>
  `;

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(fullHtml);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Iframe print error:', e);
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(fullHtml);
        win.document.close();
        win.focus();
        win.print();
      }
    }
  }, 200);
};

/**
 * DispatchSlipModal
 *
 * Automatically generates separate mini dispatch slips party-wise and dispatch date-wise.
 * Accepts either:
 * 1) normalized `slips`: Array<{ partyName, locationName, dispatchDate, items: [{ productName, quantity, unit, orderNumber }] }>
 * 2) or `parties`: Array<{ partyName, lines: [...] }> from SmartDispatchPlanning + locationName + dispatchDate
 */
export const DispatchSlipModal = ({
  isOpen,
  onClose,
  slips = null,
  parties = null,
  locationName = 'Godown',
  dispatchDate = new Date().toISOString().slice(0, 10),
}) => {
  const [selectedPartyFilter, setSelectedPartyFilter] = useState('ALL');

  // Normalize data into slips list
  const normalizedSlips = useMemo(() => {
    if (Array.isArray(slips) && slips.length > 0) {
      return slips.filter((s) => s.items && s.items.length > 0);
    }

    if (Array.isArray(parties) && parties.length > 0) {
      return parties
        .map((p, idx) => {
          // Only take items that have suggested dispatch qty > 0
          const items = (p.lines || [])
            .filter((l) => Number(l.suggested) > 0)
            .map((l) => ({
              productName: l.productName || '—',
              quantity: Number(l.suggested),
              unit: l.unit || 'BAG',
              orderNumber: l.orderNumber || '—',
            }));

          const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

          return {
            slipId: `SLIP-${idx + 1}`,
            partyName: p.partyName,
            locationName: locationName || 'Godown',
            dispatchDate: dispatchDate,
            items,
            totalQty: Math.round(totalQty * 100) / 100,
            totalItems: items.length,
          };
        })
        .filter((s) => s.items.length > 0);
    }

    return [];
  }, [slips, parties, locationName, dispatchDate]);

  // Unique list of parties for filter dropdown
  const partyOptions = useMemo(() => {
    const set = new Set();
    normalizedSlips.forEach((s) => {
      if (s.partyName) set.add(s.partyName);
    });
    return Array.from(set).sort();
  }, [normalizedSlips]);

  // Filtered slips to display/print
  const displayedSlips = useMemo(() => {
    if (selectedPartyFilter === 'ALL') {
      return normalizedSlips;
    }
    return normalizedSlips.filter((s) => s.partyName === selectedPartyFilter);
  }, [normalizedSlips, selectedPartyFilter]);

  const handlePrint = () => {
    printSlipsToIframe(displayedSlips);
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <ModalHeader>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <PackageCheck size={18} />
          </div>
          <div className="flex-1">
            <ModalTitle className="text-base font-semibold text-slate-800">
              Mini Dispatch Slips (Party-wise)
            </ModalTitle>
            <ModalDescription className="text-xs text-slate-500">
              Generated separate dispatch slips party-wise & date-wise ready for print or saving.
            </ModalDescription>
          </div>
          <div className="flex items-center gap-2 mr-6">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <Filter size={13} className="text-slate-500" />
              <span className="font-medium text-slate-500">Party:</span>
              <select
                value={selectedPartyFilter}
                onChange={(e) => setSelectedPartyFilter(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Parties ({partyOptions.length})</option>
                {partyOptions.map((party) => (
                  <option key={party} value={party}>
                    {party}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="p-6 overflow-y-auto flex-1 bg-slate-100/50">
          {displayedSlips.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <FileText size={36} className="mx-auto text-slate-300 mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No Dispatch Items To Print</h3>
              <p className="text-xs text-slate-500 mt-1">
                There are no pending or allocated dispatch lines for the selected criteria.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {displayedSlips.map((slip, index) => (
                <div
                  key={`${slip.partyName}-${index}`}
                  className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs transition-shadow relative"
                >
                  {/* Slip Header */}
                  <div className="border-b-2 border-slate-900 pb-3 mb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                          VPR SYSTEMS ENTERPRISE
                        </span>
                        <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                          DISPATCH SLIP
                        </h2>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white uppercase tracking-wider">
                          PARTY COPY
                        </span>
                        <p className="text-[11px] text-slate-500 font-mono mt-1">
                          Date: <strong className="text-slate-800">{formatDisplayDate(slip.dispatchDate)}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-200 text-xs">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-slate-500 shrink-0" />
                        <span className="text-slate-500">Party:</span>
                        <strong className="text-slate-900 text-sm font-bold truncate">
                          {slip.partyName}
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Building2 size={13} className="text-slate-500 shrink-0" />
                        <span className="text-slate-500">Godown / Location:</span>
                        <strong className="text-slate-800 font-semibold">{slip.locationName}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full text-xs border-collapse my-2">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-700 bg-slate-50">
                        <th className="py-2 px-2 text-left w-10 font-bold">#</th>
                        <th className="py-2 px-2 text-left font-bold">Product Name / Description</th>
                        <th className="py-2 px-2 text-center w-24 font-bold">Order No</th>
                        <th className="py-2 px-2 text-right w-20 font-bold">Qty</th>
                        <th className="py-2 px-2 text-center w-16 font-bold">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {slip.items.map((item, itemIdx) => (
                        <tr key={itemIdx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2 text-slate-400 font-mono text-[11px]">{itemIdx + 1}</td>
                          <td className="py-2 px-2 font-medium text-slate-800">{item.productName}</td>
                          <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">
                            {item.orderNumber || '—'}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-slate-900 text-sm">
                            {item.quantity}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600 font-semibold uppercase text-[11px]">
                            {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-900 font-bold bg-slate-50/70">
                        <td colSpan={3} className="py-2 px-2 text-slate-800 text-xs">
                          Total Items: {slip.items.length}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-900 text-sm font-black">
                          {slip.totalQty}
                        </td>
                        <td className="py-2 px-2 text-center text-slate-600 uppercase text-[11px]">
                          TOTAL
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Slip Signatures & Stamp Footer */}
                  <div className="mt-8 pt-4 border-t border-dashed border-slate-300 flex justify-between items-end text-[11px] text-slate-500">
                    <div>
                      <div className="w-36 border-b border-slate-400 mb-1" />
                      <span>Prepared By (Dispatch)</span>
                    </div>
                    <div className="text-center font-mono text-[10px] text-slate-400">
                      Generated via VPR Systems
                    </div>
                    <div className="text-right">
                      <div className="w-36 border-b border-slate-400 mb-1 ml-auto" />
                      <span>Receiver's Sign & Date</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex items-center justify-between border-t border-slate-200">
          <span className="text-xs text-slate-500">
            Showing {displayedSlips.length} of {normalizedSlips.length} slip(s)
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={displayedSlips.length === 0}
              className="gap-1.5 px-4 shadow-xs"
            >
              <Printer size={14} />
              <span>
                {selectedPartyFilter === 'ALL' && displayedSlips.length > 1
                  ? `Print All Slips (${displayedSlips.length})`
                  : 'Print Slip'}
              </span>
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DispatchSlipModal;
