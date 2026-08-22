import React from 'react';

const CandidateProfile = ({ name }) => {
  if (!name || name.trim() === '') return <span>-</span>;
  
  const nameParts = name.trim().split(/\s+/);
  let initials = '';
  if (nameParts.length > 0) {
    initials += nameParts[0][0].toUpperCase();
    if (nameParts.length > 1) {
      initials += nameParts[nameParts.length - 1][0].toUpperCase();
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 w-full">
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-[10px] flex-shrink-0 shadow-sm border border-blue-200">
        {initials}
      </div>
      <span className="font-bold text-gray-900 whitespace-nowrap truncate">{name}</span>
    </div>
  );
};

export default CandidateProfile;
