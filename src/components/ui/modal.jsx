import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Modal = DialogPrimitive.Root
const ModalTrigger = DialogPrimitive.Trigger
const ModalClose = DialogPrimitive.Close
const ModalPortal = DialogPrimitive.Portal
const ModalTitle = DialogPrimitive.Title
const ModalDescription = DialogPrimitive.Description

const ModalOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
ModalOverlay.displayName = "ModalOverlay"

const ModalContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border border-slate-200 p-0 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
        <X size={18} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </ModalPortal>
))
ModalContent.displayName = "ModalContent"

const ModalHeader = ({ className, children, ...props }) => (
  <div className={cn("px-6 py-5 border-b border-slate-100 flex items-center gap-3", className)} {...props}>
    {children}
  </div>
)

const ModalBody = ({ className, children, ...props }) => (
  <div className={cn("px-6 py-5 space-y-4", className)} {...props}>
    {children}
  </div>
)

const ModalFooter = ({ className, children, ...props }) => (
  <div className={cn("px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3", className)} {...props}>
    {children}
  </div>
)

export { Modal, ModalTrigger, ModalClose, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription }
