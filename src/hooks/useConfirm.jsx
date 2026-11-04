import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const ConfirmContext = createContext(null);

// App-wide replacement for window.confirm(). Mounted once in App.jsx.
// confirm(messageOrOptions) returns a Promise<boolean> — resolves true on OK,
// false on Cancel, Escape, or clicking outside the dialog.
export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : options || {};
    return new Promise((resolve) => setState({ ...opts, resolve }));
  }, []);

  const close = (result) => {
    state?.resolve?.(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onOpenChange={(open) => !open && close(false)}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                state?.variant === "danger" ? "bg-red-50 text-red-600" : "bg-primary/10 text-primary"
              }`}
            >
              <AlertTriangle size={18} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">{state?.title || "Please confirm"}</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-600 whitespace-pre-line">{state?.message}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.cancelText || "Cancel"}
            </Button>
            <Button variant={state?.variant === "danger" ? "destructive" : "default"} onClick={() => close(true)}>
              {state?.confirmText || "OK"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx;
}
