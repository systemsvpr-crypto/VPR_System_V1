import React from 'react';
import { LogOut } from 'lucide-react';

const LogoutButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-2xl ring-1 ring-red-500/50 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-semibold active:scale-[0.97] transition-all"
    >
      <LogOut size={18} />
      <span>Sign Out</span>
    </button>
  );
};

export default LogoutButton;
