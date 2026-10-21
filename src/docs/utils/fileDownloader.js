import toast from "react-hot-toast";
import { jsPDF } from "jspdf";

const triggerDownload = (href, fileName) => {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const resolveFile = (fileOrAttachment, docContext) => ({
  fileName:
    typeof fileOrAttachment === "string"
      ? fileOrAttachment
      : fileOrAttachment?.name || docContext?.fileName || "document.pdf",
  fileUrl: (typeof fileOrAttachment === "object" && fileOrAttachment?.url) || docContext?.fileUrl || null,
});

// Record copy used when a file has no stored binary, in the VPR primary blue.
const buildRecordPdf = (fileName, docContext) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const docName = docContext?.documentName || fileName.replace(/\.[^/.]+$/, "");
  const company = docContext?.companyName || docContext?.division || "VPR Systems";
  const person = docContext?.personName || "Authorized Signatory";
  const category = docContext?.category || "Company Document";
  const renewalStatus =
    docContext?.needsRenewal === "Yes" ? `Yes (Due: ${docContext?.renewalDate || "-"})` : "Not Required";
  const remarks = docContext?.remarks || "Registered in VPR Document Vault";

  doc.setFillColor(47, 107, 222);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("VPR SYSTEMS — DOCUMENT VAULT", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Official Record Copy", 14, 19);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(docName, 14, 38);

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 44, 182, 80, 3, 3, "FD");

  doc.setFontSize(10);
  const fields = [
    ["File Name:", fileName],
    ["Division:", company],
    ["Holder / Responsible:", person],
    ["Category:", category],
    ["Renewal Required:", renewalStatus],
    ["Document Format:", docContext?.documentType || "PDF (.pdf)"],
    [
      "Registered Date:",
      docContext?.createdAt ? new Date(docContext.createdAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"),
    ],
    ["Remarks:", remarks],
  ];

  let yPos = 53;
  fields.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(label, 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(String(val || "-"), 72, yPos);
    yPos += 8.5;
  });

  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Record copy generated on ${new Date().toLocaleString("en-IN")} for ${company}.`, 14, 138);
  return doc;
};

/**
 * Downloads a document or attachment.
 * 1. If the file has a URL (data URL in local mode, storage URL when live),
 *    downloads the binary directly.
 * 2. Otherwise (demo records, metadata-only files) generates a formal PDF
 *    record copy on the fly.
 */
export const downloadFileAttachment = async (fileOrAttachment, docContext = null) => {
  const { fileName, fileUrl } = resolveFile(fileOrAttachment, docContext);
  const toastId = toast.loading(`Preparing ${fileName} for download...`);

  try {
    if (fileUrl && /^(https?:|data:|blob:)/.test(fileUrl)) {
      try {
        const res = await fetch(fileUrl);
        if (res.ok) {
          const blobUrl = window.URL.createObjectURL(await res.blob());
          triggerDownload(blobUrl, fileName);
          window.URL.revokeObjectURL(blobUrl);
          toast.success(`Downloaded ${fileName}`, { id: toastId });
          return;
        }
      } catch (corsErr) {
        console.warn("Direct fetch blocked, opening link instead:", corsErr);
        window.open(fileUrl, "_blank", "noopener,noreferrer");
        toast.success(`Opening ${fileName}`, { id: toastId });
        return;
      }
    }

    const doc = buildRecordPdf(fileName, docContext);
    const downloadFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    doc.save(downloadFileName);
    toast.success(`Downloaded ${downloadFileName}`, { id: toastId });
  } catch (err) {
    console.error("Download error:", err);
    toast.error("Failed to download file", { id: toastId });
  }
};

/**
 * Opens a document or attachment in a new browser tab for viewing. Files with
 * no stored binary open the generated PDF record copy instead.
 */
export const openFileAttachment = (fileOrAttachment, docContext = null) => {
  const { fileName, fileUrl } = resolveFile(fileOrAttachment, docContext);
  try {
    if (fileUrl && /^(https?:|blob:)/.test(fileUrl)) {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Browsers block top-level data: URLs, and record copies need generating —
    // both open as a blob URL.
    const blob = fileUrl?.startsWith("data:")
      ? dataUrlToBlob(fileUrl)
      : buildRecordPdf(fileName, docContext).output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (err) {
    console.error("Open file error:", err);
    toast.error(`Failed to open ${fileName}`);
  }
};

const dataUrlToBlob = (dataUrl) => {
  const [header, data] = dataUrl.split(",");
  const type = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
};
