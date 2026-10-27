// WhatsApp alerts for checklist tasks, sent through VPR's existing
// `send-whatsapp` edge function (Meta Cloud API). Each alert maps to a
// Meta template that must be created/approved in the WhatsApp account
// under the name below, with parameters in the order listed.
//
// The recipient's phone comes from the module's own checklist_users row.
// Sending is best-effort: a missing phone, missing template or Meta error
// is logged and swallowed so it can never block assigning/approving work.
import supabase from "../SupabaseClient";

export const CHECKLIST_TEMPLATES = {
  assigned: "checklist_task_assigned", // doer, task id, description, start, given by, department, frequency
  urgent: "checklist_task_urgent", // same parameters as assigned
  extensionRemark: "checklist_extension_remark", // doer, task id, description, remark
  reassigned: "checklist_task_reassigned", // new doer, task id, original doer, description, start, given by
  rejected: "checklist_task_rejected", // doer, task id, task type, reason
  extended: "checklist_task_extended", // doer, task id, description, next date, reason, given by
  // The daily to-do summary ("daily_task_reminder") is sent server-side by the
  // checklist-daily-reminder edge function, not from here.
};

// Meta rejects newlines/tabs and 4+ consecutive spaces in template params.
const clean = (v) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim() || "-";

const lookupPhone = async (userName) => {
  if (!userName) return null;
  const { data, error } = await supabase
    .from("checklist_users")
    .select("*")
    .ilike("user_name", String(userName).trim())
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.number || data.phone || data.phone_number || null;
};

const send = async (userName, template, parameters) => {
  try {
    const phone = await lookupPhone(userName);
    if (!phone) return false;
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone: String(phone),
        template,
        language: "en",
        parameters: parameters.map(clean),
        module: "checklist",
        recipientName: userName,
        referenceType: "checklist_task",
        referenceId: parameters[1] ?? null,
      },
    });
    if (error || data?.success === false) {
      console.warn(`[checklist] WhatsApp "${template}" not sent:`, error || data?.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[checklist] WhatsApp "${template}" failed:`, e);
    return false;
  }
};

const assignmentParams = ({
  doerName, taskId, description, startDate, givenBy, department, frequency, machineName, partName,
}) => {
  const target = [machineName, partName].filter(Boolean).join(" / ");
  return [
    doerName,
    taskId,
    target ? `${target}: ${description || ""}` : description,
    startDate,
    givenBy,
    department,
    frequency || "One time",
  ];
};

export const sendTaskAssignmentNotification = (args) =>
  send(args.doerName, CHECKLIST_TEMPLATES.assigned, assignmentParams(args));

// High-priority maintenance tasks use a separate (more prominent) template.
export const sendUrgentTaskNotification = (args) =>
  send(args.doerName, CHECKLIST_TEMPLATES.urgent, assignmentParams(args));

export const sendAdminExtensionRemarkNotification = ({ doerName, taskId, description, remark }) =>
  send(doerName, CHECKLIST_TEMPLATES.extensionRemark, [doerName, taskId, description, remark]);

export const sendTaskReassignmentNotification = ({
  newDoerName, originalDoerName, taskId, description, startDate, givenBy,
}) =>
  send(newDoerName, CHECKLIST_TEMPLATES.reassigned, [
    newDoerName,
    taskId,
    originalDoerName,
    description,
    startDate,
    givenBy,
  ]);

export const sendTaskRejectionNotification = ({ doerName, taskId, taskType, reason }) =>
  send(doerName, CHECKLIST_TEMPLATES.rejected, [doerName, taskId, taskType, reason]);

export const sendTaskExtensionNotification = ({
  doerName, taskId, givenBy, description, nextExtendDate, reason,
}) =>
  send(doerName, CHECKLIST_TEMPLATES.extended, [
    doerName,
    taskId,
    description,
    nextExtendDate,
    reason,
    givenBy,
  ]);

// Only the old standalone checklist login used this; in VPR, passwords are
// managed by VPR Settings, so there is no separate checklist reset flow.
export const sendPasswordResetOTP = async () => {
  throw new Error("Password reset is managed from VPR Settings.");
};
