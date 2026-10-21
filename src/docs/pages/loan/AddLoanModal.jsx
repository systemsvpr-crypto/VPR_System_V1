import { useEffect, useState } from "react";
import { Coins, Save } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { loansApi } from "../../services/docsApi";
import { DocsModal, Field, FormGrid, FIELD_CLASS, FileDropzone, Spinner } from "../../components/DocsUI";

const EMPTY_FORM = {
  loanName: "",
  bankName: "",
  loanAmount: "",
  emiAmount: "",
  startDate: "",
  endDate: "",
  collateralDocument: "",
  remarks: "",
};

export default function AddLoanModal({ isOpen, onClose, onCreated }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(EMPTY_FORM);
      setFiles([]);
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesChange = (list) => {
    const next = list.slice(-1);
    if (next[0] && next[0] !== files[0]) toast.success(`Attached: ${next[0].name}`);
    setFiles(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.loanName.trim()) {
      toast.error("Please enter a Loan Facility Name");
      return;
    }
    if (!formData.bankName.trim()) {
      toast.error("Please enter Bank / Financial Institution");
      return;
    }
    if (!formData.loanAmount || Number(formData.loanAmount) <= 0) {
      toast.error("Please enter a valid Sanctioned Amount");
      return;
    }

    const selectedFile = files[0] || null;
    try {
      setSaving(true);
      await loansApi.create({
        loanName: formData.loanName.trim(),
        bankName: formData.bankName.trim(),
        loanAmount: Number(formData.loanAmount),
        emiAmount: Number(formData.emiAmount) || 0,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maturityDate: formData.endDate,
        collateralDocument: formData.collateralDocument.trim(),
        remarks: formData.remarks.trim(),
        file: selectedFile,
        fileName: selectedFile ? selectedFile.name : "",
      });

      toast.success("Bank Loan registered successfully!");
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save loan record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DocsModal
      open={isOpen}
      onClose={onClose}
      icon={Coins}
      title="Add New Bank Loan"
      description="Register facility, collateral documents & EMI details"
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
            {saving ? "Saving..." : "Save Loan Record"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Loan Facility Name" required>
          <input
            type="text"
            name="loanName"
            value={formData.loanName}
            onChange={handleChange}
            placeholder="e.g. Working Capital Term Loan"
            required
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Bank / Financial Inst." required>
          <input
            type="text"
            name="bankName"
            value={formData.bankName}
            onChange={handleChange}
            placeholder="e.g. HDFC Bank, SBI"
            required
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Sanctioned Amount (₹)" required>
          <input
            type="number"
            name="loanAmount"
            value={formData.loanAmount}
            onChange={handleChange}
            placeholder="e.g. 5000000"
            required
            min="1"
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </Field>
        <Field label="Monthly EMI / Repayment (₹)" required>
          <input
            type="number"
            name="emiAmount"
            value={formData.emiAmount}
            onChange={handleChange}
            placeholder="e.g. 85000"
            required
            min="0"
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </Field>
        <Field label="Loan Start Date">
          <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} className={FIELD_CLASS} />
        </Field>
        <Field label="Loan End Date">
          <input type="date" name="endDate" value={formData.endDate} onChange={handleChange} className={FIELD_CLASS} />
        </Field>
        <Field label="Provided Collateral Document" className="sm:col-span-2">
          <input
            type="text"
            name="collateralDocument"
            value={formData.collateralDocument}
            onChange={handleChange}
            placeholder="e.g. Factory Property Deed"
            className={FIELD_CLASS}
          />
        </Field>
      </FormGrid>

      <Field label="Upload Sanction / Agreement">
        <FileDropzone files={files} onChange={handleFilesChange} multiple={false} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
      </Field>

      <Field label="Remarks">
        <input
          type="text"
          name="remarks"
          value={formData.remarks}
          onChange={handleChange}
          placeholder="Optional remarks, sanction ref..."
          className={FIELD_CLASS}
        />
      </Field>
    </DocsModal>
  );
}
