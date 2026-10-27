// The reference module used the Checklist "magic toast" API
// (showToast(message, type)); this maps it onto VPR's react-hot-toast.
import toast from "react-hot-toast";

export const showToast = (message, type = "info") => {
  if (type === "success") return toast.success(message);
  if (type === "error") return toast.error(message);
  if (type === "warning") return toast(message, { icon: "⚠️" });
  return toast(message);
};

export const useWaToast = () => ({ showToast });
