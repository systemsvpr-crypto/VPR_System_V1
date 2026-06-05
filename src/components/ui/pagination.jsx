import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Pagination = ({ currentPage, totalPages, totalItems, startIndex, endIndex, onPageChange, className }) => (
  <div className={`flex flex-col sm:flex-row items-center justify-between p-4 gap-4 ${className}`}>
    <p className="text-sm text-slate-500">
      Showing <span className="font-medium text-slate-900">{startIndex}</span> to <span className="font-medium text-slate-900">{endIndex}</span> of <span className="font-medium text-slate-900">{totalItems}</span> results
    </p>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="h-9 w-9 border-slate-200">
        <ChevronLeft size={16} className="text-slate-600" />
      </Button>
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum;
          if (totalPages <= 5) pageNum = i + 1;
          else if (currentPage <= 3) pageNum = i + 1;
          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
          else pageNum = currentPage - 2 + i;
          return (
            <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'ghost'} size="icon"
              onClick={() => onPageChange(pageNum)}
              className={`w-9 h-9 text-sm font-medium ${currentPage === pageNum ? 'shadow-sm' : 'text-slate-600'}`}>
              {pageNum}
            </Button>
          );
        })}
      </div>
      <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-9 w-9 border-slate-200">
        <ChevronRight size={16} className="text-slate-600" />
      </Button>
    </div>
  </div>
);

export default Pagination;
