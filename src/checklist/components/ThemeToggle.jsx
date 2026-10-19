import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = ({ className = "" }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`relative inline-flex items-center justify-center p-2.5 rounded-xl border transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md cursor-pointer
        bg-bg-card border-border-primary hover:bg-bg-secondary
        text-text-secondary hover:text-text-primary ${className}`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-amber-500 animate-in spin-in-180 duration-500" />
      ) : (
        <Moon className="h-5 w-5 text-blue-700 animate-in spin-in-180 duration-500" />
      )}
      <span className="sr-only">Toggle Theme</span>
    </button>
  );
};

export default ThemeToggle;
