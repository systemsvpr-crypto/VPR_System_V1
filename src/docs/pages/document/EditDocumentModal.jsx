import { useState, useEffect } from "react";
import { FileText, Save } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi, uploadDocFile } from "../../services/docsApi";
import { DocsModal, Spinner } from "../../components/DocsUI";
import { DocumentFormFields, useDivisionOptions } from "./AddDocumentModal";

export default function EditDocumentModal({ isOpen, onClose, document, onUpdated }) {
  const { divisionOptions, defaultDivision } = useDivisionOptions();

  const [formData, setFormData] = useState({
    documentName: "",
    personName: "",
    documentType: "PDF (.pdf)",
    category: "Company",
    division: defaultDivision,
    companyName: defaultDivision,
    needsRenewal: "Yes",
    renewalDate: "",
    fileName: "",
    remarks: "",
  });
  // Existing attachments (metadata objects) plus newly picked File objects.
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (document) {
      const docDiv = document.division || document.companyName || defaultDivision;
      setFormData({
        documentName: document.documentName || "",
        personName: document.personName || document.holderName || document.name || "",
        documentType: document.documentType || "PDF (.pdf)",
        category: document.category || "Company",
        division: docDiv,
        companyName: docDiv,
        needsRenewal: document.needsRenewal === "Yes" ? "Yes" : "No",
        renewalDate: document.renewalDate || "",
        fileName: document.fileName || "",
        remarks: document.remarks || "",
      });

      if (document.attachments && Array.isArray(document.attachments)) {
        setAttachedFiles(document.attachments);
      } else if (document.fileName) {
        setAttachedFiles([{ name: document.fileName, size: 0 }]);
      } else {
        setAttachedFiles([]);
      }
    }
  }, [document, defaultDivision]);

  if (!document) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.documentName.trim()) {
      toast.error("Please enter a document name");
      return;
    }

    try {
      setSaving(true);
      const processedAttachments = await Promise.all(attachedFiles.map((file) => uploadDocFile(file, "documents")));
      await documentsApi.update(document.id, {
        ...formData,
        attachments: processedAttachments,
        fileName:
          processedAttachments.length > 0
            ? processedAttachments.map((a) => a.name).join(", ")
            : formData.fileName || "document.pdf",
        fileUrl: processedAttachments[0]?.url || document.fileUrl || "",
      });
      toast.success("Document updated successfully!");
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to update document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DocsModal
      open={isOpen}
      onClose={onClose}
      icon={FileText}
      title="Edit Document Details"
      description="Update compliance metadata, name & attachments"
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
            {saving ? <Spinner /> : <Save size={15} />}
            {saving ? "Saving..." : "Update Document"}
          </Button>
        </>
      }
    >
      <DocumentFormFields
        formData={formData}
        setFormData={setFormData}
        files={attachedFiles}
        setFiles={setAttachedFiles}
        divisionOptions={divisionOptions}
        namePlaceholder="e.g. Factory License 2026-27"
      />
    </DocsModal>
  );
}
