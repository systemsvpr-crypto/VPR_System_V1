// ============================================================================
// DOCS & SUBSCRIPTIONS — SUPABASE DATA LAYER
// Tables + storage bucket: supabase/migrations/20261021_add_docs_module.sql.
// Pages work with camelCase objects; this file maps them to the snake_case
// docs_* tables.
//
// Every date column is timestamptz. Calendar dates (renewal / payment / NOC
// dates…) are stored as UTC midnight and handed to pages as "YYYY-MM-DD", so
// <input type="date">, day counters and sorting behave like plain dates.
// Event times (approved_at, renewed_at, shared_at, created_at…) stay full ISO.
// ============================================================================
import { supabase } from "../../supabase";
import useAuthStore from "../../store/authStore";
import { DEFAULT_DIVISION } from "../utils/divisions";

export const DOCS_DATA_CHANGED_EVENT = "docs_data_changed";

const STORAGE_BUCKET = "docs_attachments";

const DOCS_TABLES = [
  "docs_documents",
  "docs_document_renewals",
  "docs_document_shares",
  "docs_subscriptions",
  "docs_sub_payments",
  "docs_sub_renewals",
  "docs_loans",
  "docs_loan_foreclosures",
];

const notifyChange = (module) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DOCS_DATA_CHANGED_EVENT, { detail: { module } }));
  }
};

// One realtime channel keeps every open page and the sidebar badges in sync
// with changes made by other users.
if (typeof window !== "undefined" && supabase) {
  try {
    const channel = supabase.channel("docs_system_realtime");
    DOCS_TABLES.forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => notifyChange(table))
    );
    channel.subscribe();
  } catch (err) {
    console.warn("Docs realtime subscription failed:", err);
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const currentUserName = (fallback) => {
  const u = useAuthStore.getState().user;
  return u?.full_name || u?.Name || u?.Username || fallback;
};

const todayDate = () => new Date().toISOString().split("T")[0];

// "YYYY-MM-DD" → UTC-midnight timestamptz; full ISO strings pass through.
const toTs = (value) => {
  if (!value) return null;
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;
};

// timestamptz → "YYYY-MM-DD" for calendar-date fields.
const toDate = (value) => (value ? String(value).slice(0, 10) : "");

const yesNo = (v) => (v === "Yes" || v === true ? "Yes" : "No");

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const fetchRow = async (table, id) => check(await supabase.from(table).select("*").eq("id", id).single());

const updateRow = async (table, id, payload) =>
  check(await supabase.from(table).update(payload).eq("id", id).select().single());

const insertRow = async (table, payload) => check(await supabase.from(table).insert([payload]).select().single());

const listRows = async (table, orderBy = "created_at") =>
  check(await supabase.from(table).select("*").order(orderBy, { ascending: false })) || [];

// ----------------------------------------------------------------------------
// Attachments (Supabase Storage)
// ----------------------------------------------------------------------------
export const uploadDocFile = async (file, folder = "documents") => {
  if (!file) return null;
  // Already-uploaded attachment metadata passes through untouched.
  if (!(file instanceof File) && !(file instanceof Blob)) return file;

  const ext = (file.name || "bin").split(".").pop();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Failed to upload "${file.name}": ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { name: file.name, size: file.size, type: file.type, url: data?.publicUrl || "", path };
};

const uploadAll = (list, folder) =>
  Array.isArray(list) ? Promise.all(list.map((f) => uploadDocFile(f, folder))) : Promise.resolve([]);

// ----------------------------------------------------------------------------
// Row transformers (DB snake_case → page camelCase)
// ----------------------------------------------------------------------------
const division = (r) => r.company_name || "";

const transformDoc = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    documentName: r.document_name,
    personName: r.person_name || "",
    documentType: r.document_type || "PDF (.pdf)",
    category: r.category || "Company",
    division: division(r),
    companyName: division(r),
    needsRenewal: r.needs_renewal || "No",
    renewalDate: toDate(r.renewal_date),
    fileName: r.file_name || "",
    fileUrl: r.file_url || "",
    attachments: r.attachments || [],
    remarks: r.remarks || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

const transformDocRenewal = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    documentId: r.document_id,
    documentName: r.document_name,
    category: r.category,
    documentType: r.document_type,
    personName: r.person_name,
    division: division(r),
    companyName: division(r),
    previousRenewalDate: toDate(r.previous_renewal_date),
    newRenewalDate: toDate(r.new_renewal_date),
    renewNextPeriod: r.renew_next_period,
    renewedAt: r.renewed_at,
    renewedBy: r.renewed_by,
    remarks: r.remarks,
    cost: Number(r.cost) || 0,
    receiptNumber: r.receipt_number || "",
    fileName: r.file_name || "",
    attachments: r.attachments || [],
    createdAt: r.created_at,
  };

const transformShare = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    shareNo: r.share_no,
    documentId: r.document_id,
    documentName: r.document_name,
    docSn: r.doc_sn,
    recipientName: r.recipient_name,
    recipientEmail: r.recipient_email || "",
    recipientPhone: r.recipient_phone || "",
    subject: r.subject || "",
    message: r.message || "",
    purpose: r.purpose || "",
    shareMethod: r.share_method || "Email",
    sharedAt: r.shared_at,
    sharedBy: r.shared_by,
    notes: r.notes || "",
    createdAt: r.created_at,
  };

const transformSub = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    subscriptionName: r.subscription_name,
    serviceName: r.service_name || "",
    division: division(r),
    companyName: division(r),
    subscriberName: r.subscriber_name || "",
    price: Number(r.price) || 0,
    frequency: r.frequency || "Monthly",
    purpose: r.purpose || "",
    status: r.status || "Pending",
    requestedDate: toDate(r.requested_date),
    renewalDate: toDate(r.renewal_date),
    paymentDueDate: toDate(r.payment_due_date),
    approvedBy: r.approved_by || "",
    approvalRemarks: r.approval_remarks || "",
    approvedAt: r.approved_at,
    lastPaidDate: toDate(r.last_paid_date),
    remarks: r.remarks || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

const transformPayment = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    subscriptionId: r.subscription_id,
    subSn: r.sub_sn,
    subscriptionName: r.subscription_name,
    division: division(r),
    companyName: division(r),
    subscriberName: r.subscriber_name,
    frequency: r.frequency,
    amountPaid: Number(r.amount_paid) || 0,
    paymentDate: toDate(r.payment_date),
    paymentMode: r.payment_mode,
    transactionRef: r.transaction_ref,
    recordedBy: r.recorded_by,
    remarks: r.remarks,
    createdAt: r.created_at,
  };

const transformSubRenewal = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    subscriptionId: r.subscription_id,
    subSn: r.sub_sn,
    subscriptionName: r.subscription_name,
    division: division(r),
    companyName: division(r),
    subscriberName: r.subscriber_name,
    frequency: r.frequency,
    previousRenewalDate: toDate(r.previous_renewal_date),
    newRenewalDate: toDate(r.new_renewal_date),
    renewPrice: Number(r.renew_price) || 0,
    renewedAt: r.renewed_at,
    renewedBy: r.renewed_by,
    remarks: r.remarks,
    createdAt: r.created_at,
  };

const transformLoan = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    loanName: r.loan_name,
    bankName: r.bank_name,
    loanAmount: Number(r.loan_amount) || 0,
    interestRate: Number(r.interest_rate) || 0,
    tenureMonths: Number(r.tenure_months) || 12,
    startDate: toDate(r.start_date),
    maturityDate: toDate(r.maturity_date),
    endDate: toDate(r.end_date || r.maturity_date),
    emiAmount: Number(r.emi_amount) || 0,
    outstandingAmount: Number(r.outstanding_amount) || 0,
    accountNumber: r.account_number || "",
    purpose: r.purpose || "",
    collateralDocument: r.collateral_document || "",
    fileName: r.file_name || "",
    fileUrl: r.file_url || "",
    attachments: r.attachments || [],
    collectNocStatus: r.collect_noc_status || "Pending",
    nocNumber: r.noc_number || "",
    nocDate: toDate(r.noc_date),
    nocCollectedBy: r.noc_collected_by || "",
    nocRemarks: r.noc_remarks || "",
    foreclosureStatus: r.foreclosure_status || "None",
    foreclosureReason: r.foreclosure_reason || "",
    status: r.status || "Active",
    remarks: r.remarks || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

const transformForeclosure = (r) =>
  r && {
    id: r.id,
    sn: r.sn,
    loanId: r.loan_id,
    loanName: r.loan_name,
    bankName: r.bank_name,
    outstandingAmount: Number(r.outstanding_amount) || 0,
    requestedDate: toDate(r.requested_date),
    requestedBy: r.requested_by,
    reason: r.reason,
    remarks: r.remarks,
    status: r.status,
    settlementAmount: r.settlement_amount != null ? Number(r.settlement_amount) : null,
    settledDate: toDate(r.settled_date),
    settledRemarks: r.settled_remarks,
    createdAt: r.created_at,
  };

// ----------------------------------------------------------------------------
// DOCUMENTS
// ----------------------------------------------------------------------------
export const documentsApi = {
  list: async () => (await listRows("docs_documents")).map(transformDoc),

  getById: async (id) =>
    transformDoc(check(await supabase.from("docs_documents").select("*").eq("id", id).maybeSingle())),

  create: async (data) => {
    const attachments = await uploadAll(data.attachments || [], "documents");
    const row = await insertRow("docs_documents", {
      document_name: data.documentName || "",
      person_name: data.personName || data.holderName || data.name || "",
      document_type: data.documentType || "PDF (.pdf)",
      category: data.category || "Company",
      company_name: data.division || data.companyName || DEFAULT_DIVISION,
      needs_renewal: yesNo(data.needsRenewal),
      renewal_date: toTs(data.renewalDate),
      attachments,
      file_name: data.fileName || attachments.map((a) => a.name).join(", "),
      file_url: data.fileUrl || attachments[0]?.url || "",
      remarks: data.remarks || "",
    });
    notifyChange("docs_documents");
    return transformDoc(row);
  },

  update: async (id, data) => {
    const payload = {};
    if (data.documentName !== undefined) payload.document_name = data.documentName;
    if (data.personName !== undefined) payload.person_name = data.personName;
    if (data.documentType !== undefined) payload.document_type = data.documentType;
    if (data.category !== undefined) payload.category = data.category;
    if (data.division !== undefined || data.companyName !== undefined) {
      payload.company_name = data.division !== undefined ? data.division : data.companyName;
    }
    if (data.needsRenewal !== undefined) payload.needs_renewal = yesNo(data.needsRenewal);
    if (data.renewalDate !== undefined) payload.renewal_date = toTs(data.renewalDate);
    if (data.fileName !== undefined) payload.file_name = data.fileName;
    if (data.fileUrl !== undefined) payload.file_url = data.fileUrl;
    if (data.attachments !== undefined) payload.attachments = await uploadAll(data.attachments, "documents");
    if (data.remarks !== undefined) payload.remarks = data.remarks;

    const row = await updateRow("docs_documents", id, payload);
    notifyChange("docs_documents");
    return transformDoc(row);
  },

  remove: async (id) => {
    check(await supabase.from("docs_documents").delete().eq("id", id));
    notifyChange("docs_documents");
    return true;
  },

  listRenewals: async () => (await listRows("docs_document_renewals", "renewed_at")).map(transformDocRenewal),

  recordRenewal: async (docId, renewalData) => {
    const doc = await fetchRow("docs_documents", docId);
    const attachments = await uploadAll(renewalData.attachments || [], "renewals");

    const docUpdate = { renewal_date: toTs(renewalData.newRenewalDate) || doc.renewal_date };
    if (renewalData.needsRenewal !== undefined) docUpdate.needs_renewal = yesNo(renewalData.needsRenewal);
    if (attachments.length > 0) {
      docUpdate.attachments = [...(doc.attachments || []), ...attachments];
      docUpdate.file_name = attachments[0].name;
      if (attachments[0].url) docUpdate.file_url = attachments[0].url;
    } else if (renewalData.fileName) {
      docUpdate.file_name = renewalData.fileName;
    }

    const row = await insertRow("docs_document_renewals", {
      document_id: docId,
      document_name: doc.document_name,
      category: doc.category,
      document_type: doc.document_type,
      person_name: doc.person_name,
      company_name: doc.company_name,
      previous_renewal_date: doc.renewal_date,
      new_renewal_date: toTs(renewalData.newRenewalDate),
      renew_next_period: renewalData.renewNextPeriod !== false,
      renewed_by: renewalData.renewedBy || currentUserName("Admin"),
      remarks: renewalData.remarks || "",
      cost: Number(renewalData.cost) || 0,
      receipt_number: renewalData.receiptNumber || "",
      file_name: renewalData.fileName || docUpdate.file_name || doc.file_name || "",
      attachments,
    });
    await updateRow("docs_documents", docId, docUpdate);

    notifyChange("docs_document_renewals");
    return transformDocRenewal(row);
  },

  listShares: async () => (await listRows("docs_document_shares", "shared_at")).map(transformShare),

  recordShare: async (shareData) => {
    const row = await insertRow("docs_document_shares", {
      document_id: shareData.documentId,
      document_name: shareData.documentName,
      doc_sn: shareData.docSn,
      recipient_name: shareData.recipientName,
      recipient_email: shareData.recipientEmail || "",
      recipient_phone: shareData.recipientPhone || "",
      subject: shareData.subject || "",
      message: shareData.message || "",
      purpose: shareData.purpose || shareData.subject || "",
      share_method: shareData.shareMethod || "Email",
      shared_by: shareData.sharedBy || currentUserName("Admin User"),
      notes: shareData.notes || shareData.message || "",
    });
    notifyChange("docs_document_shares");
    return transformShare(row);
  },
};

// ----------------------------------------------------------------------------
// SUBSCRIPTIONS — Pending → Approved | Rejected → Paid → (renewal) → Pending
// ----------------------------------------------------------------------------
export const subscriptionsApi = {
  list: async () => (await listRows("docs_subscriptions")).map(transformSub),

  getById: async (id) =>
    transformSub(check(await supabase.from("docs_subscriptions").select("*").eq("id", id).maybeSingle())),

  create: async (data) => {
    const row = await insertRow("docs_subscriptions", {
      subscription_name: data.subscriptionName || "",
      service_name: data.serviceName || "",
      company_name: data.division || data.companyName || DEFAULT_DIVISION,
      subscriber_name: data.subscriberName || "",
      price: Number(data.price) || 0,
      frequency: data.frequency || "Monthly",
      purpose: data.purpose || "",
      status: "Pending",
      requested_date: toTs(data.requestedDate || todayDate()),
      renewal_date: toTs(data.renewalDate),
      payment_due_date: toTs(data.paymentDueDate || data.renewalDate),
      remarks: data.remarks || "",
    });
    notifyChange("docs_subscriptions");
    return transformSub(row);
  },

  update: async (id, data) => {
    const payload = {};
    if (data.subscriptionName !== undefined) payload.subscription_name = data.subscriptionName;
    if (data.serviceName !== undefined) payload.service_name = data.serviceName;
    if (data.division !== undefined || data.companyName !== undefined) {
      payload.company_name = data.division !== undefined ? data.division : data.companyName;
    }
    if (data.subscriberName !== undefined) payload.subscriber_name = data.subscriberName;
    if (data.price !== undefined) payload.price = Number(data.price) || 0;
    if (data.frequency !== undefined) payload.frequency = data.frequency;
    if (data.purpose !== undefined) payload.purpose = data.purpose;
    if (data.status !== undefined) payload.status = data.status;
    if (data.renewalDate !== undefined) payload.renewal_date = toTs(data.renewalDate);

    const row = await updateRow("docs_subscriptions", id, payload);
    notifyChange("docs_subscriptions");
    return transformSub(row);
  },

  approve: async (id, { status, approvedBy, remarks }) => {
    const row = await updateRow("docs_subscriptions", id, {
      status, // "Approved" | "Rejected"
      approved_by: approvedBy || currentUserName("Admin"),
      approval_remarks: remarks || "",
      approved_at: new Date().toISOString(),
    });
    notifyChange("docs_subscriptions");
    return transformSub(row);
  },

  pay: async (id, paymentData) => {
    const sub = await fetchRow("docs_subscriptions", id);
    const payDate = toTs(paymentData.paymentDate || todayDate());

    const row = await insertRow("docs_sub_payments", {
      subscription_id: id,
      sub_sn: sub.sn,
      subscription_name: sub.subscription_name,
      company_name: sub.company_name,
      subscriber_name: sub.subscriber_name || "",
      frequency: sub.frequency || "Monthly",
      amount_paid: Number(paymentData.amountPaid) || sub.price,
      payment_date: payDate,
      payment_mode: paymentData.paymentMode || "Corporate Credit Card",
      transaction_ref: paymentData.transactionRef || "",
      recorded_by: paymentData.recordedBy || currentUserName("Accounts Team"),
      remarks: paymentData.remarks || "",
    });
    await updateRow("docs_subscriptions", id, { status: "Paid", last_paid_date: payDate });

    notifyChange("docs_sub_payments");
    return transformPayment(row);
  },

  listPayments: async () => (await listRows("docs_sub_payments")).map(transformPayment),

  recordRenewal: async (subId, renewalData) => {
    const sub = await fetchRow("docs_subscriptions", subId);
    const nextDate = toTs(renewalData.nextRenewalDate);

    const row = await insertRow("docs_sub_renewals", {
      subscription_id: subId,
      sub_sn: sub.sn,
      subscription_name: sub.subscription_name,
      company_name: sub.company_name,
      subscriber_name: sub.subscriber_name || "",
      frequency: sub.frequency || "Monthly",
      previous_renewal_date: sub.renewal_date,
      new_renewal_date: nextDate,
      renew_price: Number(renewalData.price) || sub.price,
      renewed_by: renewalData.renewedBy || currentUserName("Admin"),
      remarks: renewalData.remarks || "",
    });
    // A renewed cycle goes back through approval and payment.
    await updateRow("docs_subscriptions", subId, { renewal_date: nextDate, payment_due_date: nextDate, status: "Pending" });

    notifyChange("docs_sub_renewals");
    return transformSubRenewal(row);
  },

  listRenewals: async () => (await listRows("docs_sub_renewals")).map(transformSubRenewal),

  remove: async (id) => {
    check(await supabase.from("docs_subscriptions").delete().eq("id", id));
    notifyChange("docs_subscriptions");
    return true;
  },
};

// ----------------------------------------------------------------------------
// LOANS — Active → foreclosure Requested → Settled (loan Closed) → NOC collected
// ----------------------------------------------------------------------------
export const loansApi = {
  list: async () => (await listRows("docs_loans")).map(transformLoan),

  getById: async (id) => transformLoan(check(await supabase.from("docs_loans").select("*").eq("id", id).maybeSingle())),

  create: async (data) => {
    let attachments = data.attachments || [];
    let fileUrl = data.fileUrl || "";
    const file = data.file?.rawFile || data.file;
    if (file instanceof File) {
      const uploaded = await uploadDocFile(file, "loans");
      attachments = [uploaded];
      fileUrl = uploaded.url;
    }

    const row = await insertRow("docs_loans", {
      loan_name: data.loanName || "",
      bank_name: data.bankName || "",
      loan_amount: Number(data.loanAmount || data.sanctionedAmount) || 0,
      interest_rate: Number(data.interestRate) || 0,
      tenure_months: Number(data.tenureMonths) || 12,
      start_date: toTs(data.startDate),
      maturity_date: toTs(data.maturityDate || data.endDate),
      end_date: toTs(data.endDate || data.maturityDate),
      emi_amount: Number(data.emiAmount) || 0,
      outstanding_amount: Number(data.outstandingAmount) || Number(data.loanAmount) || 0,
      account_number: data.accountNumber || "",
      purpose: data.purpose || "",
      collateral_document: data.collateralDocument || "",
      file_name: data.fileName || attachments[0]?.name || "",
      file_url: fileUrl,
      attachments,
      collect_noc_status: "Pending",
      foreclosure_status: "None",
      status: "Active",
      remarks: data.remarks || "",
    });
    notifyChange("docs_loans");
    return transformLoan(row);
  },

  update: async (id, data) => {
    const payload = {};
    if (data.loanName !== undefined) payload.loan_name = data.loanName;
    if (data.bankName !== undefined) payload.bank_name = data.bankName;
    if (data.loanAmount !== undefined) payload.loan_amount = Number(data.loanAmount);
    if (data.interestRate !== undefined) payload.interest_rate = Number(data.interestRate);
    if (data.tenureMonths !== undefined) payload.tenure_months = Number(data.tenureMonths);
    if (data.emiAmount !== undefined) payload.emi_amount = Number(data.emiAmount);
    if (data.outstandingAmount !== undefined) payload.outstanding_amount = Number(data.outstandingAmount);
    if (data.status !== undefined) payload.status = data.status;

    const row = await updateRow("docs_loans", id, payload);
    notifyChange("docs_loans");
    return transformLoan(row);
  },

  foreclosureRequest: async (loanId, requestData) => {
    const loan = await fetchRow("docs_loans", loanId);

    const row = await insertRow("docs_loan_foreclosures", {
      loan_id: loanId,
      loan_name: loan.loan_name,
      bank_name: loan.bank_name,
      outstanding_amount: loan.outstanding_amount,
      requested_date: toTs(todayDate()),
      requested_by: requestData.requestedBy || currentUserName("Finance Head"),
      reason: requestData.reason || "",
      remarks: requestData.remarks || "",
      status: "Pending",
    });
    await updateRow("docs_loans", loanId, {
      foreclosure_status: "Requested",
      foreclosure_reason: requestData.reason || "",
    });

    notifyChange("docs_loan_foreclosures");
    return transformForeclosure(row);
  },

  foreclosureApproveOrSettle: async (foreclosureId, { action, settlementAmount, remarks }) => {
    const fc = await fetchRow("docs_loan_foreclosures", foreclosureId);
    const nextStatus = action === "settle" ? "Settled" : "Approved";

    const row = await updateRow("docs_loan_foreclosures", foreclosureId, {
      status: nextStatus,
      settlement_amount: settlementAmount ? Number(settlementAmount) : fc.outstanding_amount,
      settled_date: toTs(todayDate()),
      settled_remarks: remarks || "",
    });

    const loanUpdate = { foreclosure_status: nextStatus };
    if (action === "settle") {
      loanUpdate.outstanding_amount = 0;
      loanUpdate.status = "Closed";
    }
    await updateRow("docs_loans", fc.loan_id, loanUpdate);

    notifyChange("docs_loan_foreclosures");
    return transformForeclosure(row);
  },

  listForeclosures: async () => (await listRows("docs_loan_foreclosures")).map(transformForeclosure),

  collectNoc: async (loanId, nocData) => {
    const row = await updateRow("docs_loans", loanId, {
      collect_noc_status: "Yes",
      noc_number: nocData.nocNumber || "",
      noc_date: toTs(nocData.nocDate || todayDate()),
      noc_collected_by: nocData.nocCollectedBy || currentUserName("Admin"),
      noc_remarks: nocData.remarks || "",
    });
    notifyChange("docs_loans");
    return transformLoan(row);
  },

  remove: async (id) => {
    check(await supabase.from("docs_loans").delete().eq("id", id));
    notifyChange("docs_loans");
    return true;
  },
};

// ----------------------------------------------------------------------------
// SIDEBAR BADGES — each stage counts exactly what its page lists as pending.
// Head-only count queries, so no rows are downloaded.
// ----------------------------------------------------------------------------
const countRows = async (table, apply) => {
  const { count, error } = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count || 0;
};

export const fetchDocsSidebarBadgeCounts = async () => {
  try {
    const [documentRenewal, subscriptionApproval, subscriptionPayment, subscriptionRenewal, loanForeclosure, loanNoc] =
      await Promise.all([
        countRows("docs_documents", (q) => q.eq("needs_renewal", "Yes")),
        countRows("docs_subscriptions", (q) => q.eq("status", "Pending")),
        countRows("docs_subscriptions", (q) => q.eq("status", "Approved")),
        countRows("docs_subscriptions", (q) => q.neq("status", "Rejected")),
        countRows("docs_loan_foreclosures", (q) => q.neq("status", "Settled")),
        countRows("docs_loans", (q) => q.neq("collect_noc_status", "Yes")),
      ]);
    const counts = { documentRenewal, subscriptionApproval, subscriptionPayment, subscriptionRenewal, loanForeclosure, loanNoc };
    return { ...counts, total: Object.values(counts).reduce((s, n) => s + n, 0) };
  } catch (err) {
    console.error("Error loading docs sidebar badge counts:", err);
    return {
      documentRenewal: 0,
      subscriptionApproval: 0,
      subscriptionPayment: 0,
      subscriptionRenewal: 0,
      loanForeclosure: 0,
      loanNoc: 0,
      total: 0,
    };
  }
};
