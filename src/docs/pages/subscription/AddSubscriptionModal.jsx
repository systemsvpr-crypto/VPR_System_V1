import { useState, useMemo, useEffect } from "react";
import { CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { subscriptionsApi } from "../../services/docsApi";
import { ALL_DIVISIONS, DEFAULT_DIVISION, getUserAllowedDivisions } from "../../utils/divisions";
import { DocsModal, Field, FormGrid, FIELD_CLASS, TEXTAREA_CLASS, Spinner } from "../../components/DocsUI";

export const FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"];

const calculateRenewalDate = (frequency) => {
  const d = new Date();
  if (frequency === "Quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "Half-Yearly") d.setMonth(d.getMonth() + 6);
  else if (frequency === "Yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
};

export default function AddSubscriptionModal({ isOpen, onClose, onCreated }) {
  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);
  const divisionOptions = useMemo(() => {
    if (Array.isArray(allowedDivisions) && allowedDivisions.length > 0) {
      return ALL_DIVISIONS.filter((d) => allowedDivisions.includes(d));
    }
    return ALL_DIVISIONS;
  }, [allowedDivisions]);

  const defaultDivision = divisionOptions[0] || DEFAULT_DIVISION;

  const emptyForm = () => ({
    subscriptionName: "",
    serviceName: "",
    division: defaultDivision,
    companyName: defaultDivision,
    subscriberName: "",
    price: "",
    frequency: "Monthly",
    purpose: "",
  });

  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setFormData(emptyForm());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.subscriptionName.trim()) {
      toast.error("Please enter subscription name");
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast.error("Please enter a valid price / recurring cost");
      return;
    }

    try {
      setSaving(true);
      const requestedDate = new Date().toISOString().split("T")[0];
      const renewalDate = calculateRenewalDate(formData.frequency);
      await subscriptionsApi.create({
        ...formData,
        requestedDate,
        renewalDate,
        paymentDueDate: renewalDate,
      });
      toast.success("Subscription request registered & submitted for approval!");
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to register subscription");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DocsModal
      open={isOpen}
      onClose={onClose}
      icon={CreditCard}
      title="Add New Subscription Request"
      description="Request tool license or SaaS software approval"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
            {saving ? <Spinner /> : <CreditCard size={15} />}
            {saving ? "Registering..." : "Submit for Approval"}
          </Button>
        </>
      }
    >
      <Field label="Subscription Name" required>
        <input
          type="text"
          name="subscriptionName"
          value={formData.subscriptionName}
          onChange={handleChange}
          placeholder="e.g. AWS Cloud Hosting Plan / Microsoft 365 Standard"
          required
          className={FIELD_CLASS}
        />
      </Field>

      <FormGrid>
        <Field label="Service / Tool Name">
          <input
            type="text"
            name="serviceName"
            value={formData.serviceName}
            onChange={handleChange}
            placeholder="e.g. AWS / Microsoft / Autodesk"
            className={FIELD_CLASS}
          />
        </Field>
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
      </FormGrid>

      <FormGrid>
        <Field label="Subscriber Dept / Owner" required>
          <input
            type="text"
            name="subscriberName"
            value={formData.subscriberName}
            onChange={handleChange}
            placeholder="e.g. Design & R&D Team"
            required
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Cost / Price (₹)" required>
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            placeholder="e.g. 24500"
            required
            min="1"
            className={`${FIELD_CLASS} tabular-nums`}
          />
        </Field>
      </FormGrid>

      <Field label="Billing Cycle" required>
        <select name="frequency" value={formData.frequency} onChange={handleChange} className={FIELD_CLASS}>
          {FREQUENCIES.map((freq) => (
            <option key={freq} value={freq}>
              {freq}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Purpose & Business Justification">
        <textarea
          name="purpose"
          value={formData.purpose}
          onChange={handleChange}
          rows={3}
          placeholder="Explain why this software / service is required..."
          className={TEXTAREA_CLASS}
        />
      </Field>
    </DocsModal>
  );
}
