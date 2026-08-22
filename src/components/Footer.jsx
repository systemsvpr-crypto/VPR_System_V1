import React from 'react';

const Footer = () => {
  return (
    <footer className="w-full py-3 md:py-2 aidash-glass bg-white/70 border-t border-royal-600/25 shadow-[0_-4px_16px_rgba(37,99,235,0.06)]">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-[13px] md:text-sm font-bold md:font-medium text-royal-700">
          Powered By <a
            href="https://www.botivate.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-royal-700 md:text-royal-600 hover:text-royal-800 font-black md:font-bold hover:underline transition-all"
          >
           Botivate
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
