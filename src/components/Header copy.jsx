import React from 'react';
import { Menu } from 'lucide-react';

const Header = ({ onMenuClick, user }) => {
  return (
    <header className="sticky top-0 z-30 aidash-glass bg-white/70 border-b border-royal-600/25 shadow-glass-sm">
      <div className="flex justify-between items-center h-16 px-4 sm:px-6 lg:px-8">

        {/* Left Section: Mobile Menu & Search */}
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-royal-600 hover:bg-royal-100/60 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Right Section (empty – profile moved to sidebar) */}
        <div className="flex items-center"></div>
      </div>
    </header>
  );
};

export default Header;
