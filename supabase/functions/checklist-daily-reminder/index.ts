// Supabase Edge Function: daily to-do reminder for checklist doers.
//
// For every active checklist user with open work it sends the approved Meta
// template "daily_task_reminder" through the `send-whatsapp` function (which
// also writes whatsapp_logs):
//   {{1}} user name   {{2}} today's tasks   {{3}} overdue tasks
//
// "Open work" mirrors the live task list (src/checklist/pages/admin/AllTasks.jsx
// and src/checklist/redux/api/reminderApi.js): checklist + delegation rows still
// pending, planned within the last 90 days up to the end of today, plus extended
// tasks (counted as today). Occurrences on holidays are skipped and duplicates
// of the same task on the same day count once.
//
// Triggered by pg_cron every morning (see migration
// 20261027_schedule_checklist_daily_reminder.sql) and by the "Send Daily
// Reminders" button on /checklist/task. Each user gets at most one reminder per
// day — users already sent one today (per whatsapp_logs) are skipped — and
// nothing is sent on a holiday or a non-working day.
//
// Body (optional): { dryRun: true } — work out who would get what, send nothing.
// Response: { success, date, skippedReason?, sent, failed, alreadySent, noPhone,
//             total, failures, preview? }

export {};
declare const Deno: any;

const TEMPLATE = 'daily_task_reminder';
const LANGUAGE = 'en';
const REFERENCE_TYPE = 'checklist_daily_todo';
const OVERDUE_WINDOW_DAYS = 90;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// planned_date / holiday_date hold IST wall-clock, and the runtime is UTC.
const istDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + 330 * 60000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const get = async (path: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`);
    return (await r.json()) as any[];
  };

  // PostgREST caps a response at 1000 rows, so page through larger sets.
  const getAll = async (path: string) => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await get(`${path}&order=id.asc&limit=1000&offset=${offset}`);
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  };

  try {
    const { dryRun = false } = await req.json().catch(() => ({}));
    const today = istDate();
    const from = `${istDate(-OVERDUE_WINDOW_DAYS)}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;

    const [holidays, workingToday, workingAny] = await Promise.all([
      get(`holidays?select=holiday_date&holiday_date=eq.${today}`),
      get(`working_day_calender?select=working_date&working_date=eq.${today}`),
      get(`working_day_calender?select=working_date&limit=1`),
    ]);
    if (holidays.length > 0) {
      return json({ success: true, date: today, skippedReason: 'holiday', sent: 0, total: 0 });
    }
    // An empty calendar means "not maintained" — don't block on it.
    if (workingAny.length > 0 && workingToday.length === 0) {
      return json({ success: true, date: today, skippedReason: 'non-working day', sent: 0, total: 0 });
    }

    const openFilter =
      `select=name,task_description,planned_date,status` +
      `&or=(submission_date.is.null,status.in.(extend,extended))` +
      `&planned_date=gte.${from}&deleted_at=is.null`;

    const [checklist, delegation, holidayRows, users, sentToday] = await Promise.all([
      getAll(`checklist?${openFilter}`),
      getAll(`delegation?${openFilter}`),
      get(`holidays?select=holiday_date&holiday_date=gte.${from.slice(0, 10)}&holiday_date=lte.${today}`),
      get(`checklist_users?select=*`),
      get(
        `whatsapp_logs?select=recipient_name&status=eq.sent&reference_type=eq.${REFERENCE_TYPE}` +
          `&created_at=gte.${today}T00:00:00%2B05:30`,
      ),
    ]);

    const holidaySet = new Set(holidayRows.map((h) => String(h.holiday_date || '').slice(0, 10)));
    const alreadySent = new Set(sentToday.map((l) => String(l.recipient_name || '').toLowerCase()));

    // Tally overdue / today per doer.
    const counts = new Map<string, { today: number; overdue: number }>();
    const seen = new Set<string>();
    for (const row of [...checklist, ...delegation]) {
      const name = String(row.name || '').trim();
      const day = String(row.planned_date || '').slice(0, 10);
      const status = String(row.status || '').toLowerCase();
      const extended = status === 'extend' || status === 'extended';
      if (!name || !day || holidaySet.has(day)) continue;
      if (!extended && String(row.planned_date) > todayEnd) continue;

      const key = `${row.task_description || ''}::${name}::${day}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const c = counts.get(name.toLowerCase()) || { today: 0, overdue: 0 };
      if (day < today) c.overdue += 1;
      else c.today += 1;
      counts.set(name.toLowerCase(), c);
    }

    const result = { sent: 0, failed: 0, alreadySent: 0, noPhone: 0, total: 0 };
    const failures: Array<{ user: string; error: unknown }> = [];
    const preview: Array<{ user: string; today: number; overdue: number; status: string }> = [];

    for (const u of users) {
      const userName = String(u.user_name || '').trim();
      if (!userName || String(u.status || '').toLowerCase() === 'inactive') continue;
      const c = counts.get(userName.toLowerCase());
      if (!c || c.today + c.overdue === 0) continue;
      result.total += 1;

      const phone = u.number || u.phone || u.phone_number;
      const skip = alreadySent.has(userName.toLowerCase())
        ? 'alreadySent'
        : !phone
          ? 'noPhone'
          : null;
      if (dryRun) {
        preview.push({ user: userName, ...c, status: skip || 'would send' });
        continue;
      }
      if (skip) {
        result[skip] += 1;
        continue;
      }

      const r = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: String(phone),
          template: TEMPLATE,
          language: LANGUAGE,
          parameters: [userName, String(c.today), String(c.overdue)],
          module: 'checklist',
          recipientName: userName,
          referenceType: REFERENCE_TYPE,
          referenceId: today,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body?.success) {
        result.sent += 1;
      } else {
        result.failed += 1;
        failures.push({ user: userName, error: body?.error || r.status });
      }
    }

    if (failures.length) console.error('daily reminder failures:', JSON.stringify(failures));
    return json({ success: true, date: today, ...result, failures, ...(dryRun ? { preview } : {}) });
  } catch (err) {
    console.error('checklist-daily-reminder error:', err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
