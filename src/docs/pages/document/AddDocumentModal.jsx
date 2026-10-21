import { useState, useMemo } from "react";
import { FileText, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi, uploadDocFile } from "../../services/docsApi";
import { ALL_DIVISIONS, DEFAULT_DIVISION, getUserAllowedDivisions } from "../../utils/divisions";
import {
  DocsModal,
  Field,
  FormGrid,
  FIELD_CLASS,
  TEXTAREA_CLASS,
  FileDropzone,
  Pill,
  Spinner,
} from "../../components/DocsUI";

export const DOCUMENT_TYPES = [
  "PDF (.pdf)",
  "Word (.docx, .doc)",
  "Excel (.xlsx, .xls)",
  "PowerPoint (.pptx, .ppt)",
  "Image (.jpg, .png, .jpeg)",
  "Text (.txt)",
  "CSV (.csv)",
  "ZIP / Archive (.zip, .rar)",
  "Other",
];

export const CATEGORIES = ["Personal", "Company", "Director"];

export const MAX_ATTACHMENTS = 10;

const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip,.rar";

export const useDivisionOptions = () => {
  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);
  const divisionOptions = useMemo(() => {
    if (Array.isArray(allowedDivisions) && allowedDivisions.length > 0) {
      return ALL_DIVISIONS.filter((d) => allowedDivisions.includes(d));
    }
    return ALL_DIVISIONS;
  }, [allowedDivisions]);
  return { divisionOptions, defaultDivision: divisionOptions[0] || DEFAULT_DIVISION };
};

// Form body shared by the Add and Edit document modals.
export function DocumentFormFields({ formData, setFormData, files, setFiles, divisionOptions, namePlaceholder }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesChange = (next) => {
    if (next.length > MAX_ATTACHMENTS) {
      toast.error(`You can upload a maximum of ${MAX_ATTACHMENTS} attachments`);
      setFiles(next.slice(0, MAX_ATTACHMENTS));
      return;
    }
    setFiles(next);
  };

  const nameHint =
    formData.category === "Director"
      ? "Director Name"
      : formData.category === "Personal"
        ? "Person Name"
        : "Holder / Person Name";

  return (
    <>
      <Field label="Document Name" required>
        <input
          type="text"
          name="documentName"
          value={formData.documentName}
          onChange={handleChange}
          placeholder={namePlaceholder}
          required
          className={FIELD_CLASS}
        />
      </Field>

      <FormGrid>
        <Field label="Document Type" required>
          <select name="documentType" value={formData.documentType} onChange={handleChange} className={FIELD_CLASS}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" required>
          <select name="category" value={formData.category} onChange={handleChange} className={FIELD_CLASS}>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>

      <FormGrid>
        <Field label="Division" required>
          <select
            name="division"
            value={formData.division || formData.companyName}
            onChange={(e) => {
              const val = e.target.value;
              setFormData((prev) => ({ ...prev, division: val, companyName: val }));
            }}
            className={FIELD_CLASS}
          >
            {divisionOptions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Name (${nameHint})`}>
          <input
            type="text"
            name="personName"
            value={formData.personName}
            onChange={handleChange}
            placeholder="e.g. John Doe / Director Name"
            className={FIELD_CLASS}
          />
        </Field>
      </FormGrid>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-700">Does this require periodic renewal?</p>
            <p className="text-[11px] text-slate-500">Track expiration and get reminder alerts</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {["Yes", "No"].map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="radio"
                  name="needsRenewal"
                  value={opt}
                  checked={formData.needsRenewal === opt}
                  onChange={handleChange}
                  className="accent-primary"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
        {formData.needsRenewal === "Yes" && (
          <Field label="Renewal / Expiry Date" required>
            <input
              type="date"
              name="renewalDate"
              value={formData.renewalDate}
              onChange={handleChange}
              required
              className={FIELD_CLASS}
            />
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            Document Files / Attachments
          </span>
          <Pill tone={files.length >= MAX_ATTACHMENTS ? "amber" : "slate"}>
            {files.length} / {MAX_ATTACHMENTS} files
          </Pill>
        </div>
        <FileDropzone files={files} onChange={handleFilesChange} accept={FILE_ACCEPT} />
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <AlertCircle size={12} className="text-amber-500 shrink-0" />
          You can attach up to {MAX_ATTACHMENTS} files per document record.
        </p>
      </div>

      <Field label="Remarks / Notes">
        <textarea
          name="remarks"
          value={formData.remarks}
          onChange={handleChange}
          rows={2}
          placeholder="Any additional notes, reference numbers, or physical vault shelf location..."
          className={TEXTAREA_CLASS}
        />
      </Field>
    </>
  );
}

const blankForm = (division) => ({
  documentName: "",
  personName: "",
  documentType: "PDF (.pdf)",
  category: "Company",
  division,
  companyName: division,
  needsRenewal: "Yes",
  renewalDate: "",
  fileName: "",
  remarks: "",
});

export default function AddDocumentModal({ isOpen, onClose, onCreated }) {
  const { divisionOptions, defaultDivision } = useDivisionOptions();
  const [formData, setFormData] = useState(() => blankForm(defaultDivision));
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.documentName.trim()) {
      toast.error("Please enter a document name");
      return;
    }
    if (formData.needsRenewal === "Yes" && !formData.renewalDate) {
      toast.error("Please provide a renewal date");
      return;
    }

    try {
      setSaving(true);
      const uploadedAttachments = await Promise.all(selectedFiles.map((file) => uploadDocFile(file, "documents")));
      await documentsApi.create({
        ...formData,
        attachments: uploadedAttachments,
        fileName:
          uploadedAttachments.length > 0
            ? uploadedAttachments.map((a) => a.name).join(", ")
            : formData.fileName || "document.pdf",
        fileUrl: uploadedAttachments[0]?.url || "",
      });
      toast.success("Document added successfully to vault!");
      setFormData(blankForm(defaultDivision));
      setSelectedFiles([]);
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to add document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DocsModal
      open={isOpen}
      onClose={onClose}
      icon={FileText}
      title="Add New Document"
      description="Register document metadata, name, and attachments"
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
            {saving ? <Spinner /> : <FileText size={15} />}
            {saving ? "Saving..." : "Save Document"}
          </Button>
        </>
      }
    >
      <DocumentFormFields
        formData={formData}
        setFormData={setFormData}
        files={selectedFiles}
        setFiles={setSelectedFiles}
        divisionOptions={divisionOptions}
        namePlaceholder="e.g. Factory License 2026-27 / PAN Card / Agreement"
      />
    </DocsModal>
  );
}
