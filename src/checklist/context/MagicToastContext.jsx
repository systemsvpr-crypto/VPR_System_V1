// Toast provider for the checklist module. Pages call
// `const { showToast } = useMagicToast()` then `showToast(message, type)`
// with type one of success | error | warning | info; toasts stack in the
// top-right corner and dismiss themselves after `duration` ms.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import MagicToast from "../components/MagicToast";

const MagicToastContext = createContext({ showToast: () => {} });

let nextToastId = 0;

export const MagicToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++nextToastId;
    setToasts((prev) => [...prev, { id, message: String(message ?? ""), type, duration }]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <MagicToastContext.Provider value={value}>
      {children}
      <div className="fixed top-20 right-6 z-[100000] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <MagicToast
              message={t.message}
              type={t.type}
              duration={t.duration}
              onClose={() => removeToast(t.id)}
            />
          </div>
        ))}
      </div>
    </MagicToastContext.Provider>
  );
};

export const useMagicToast = () => useContext(MagicToastContext);
