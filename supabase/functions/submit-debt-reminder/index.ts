import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { sender_name, subject, amount, note = "", website = "" } = await req.json();
    if (website) return json({ ok: true }); // honeypot
    const sender = String(sender_name || "").trim();
    const title = String(subject || "").trim();
    const value = Number(amount);
    const detail = String(note || "").trim();
    if (!sender || sender.length > 80 || !title || title.length > 160 || !Number.isFinite(value) || value <= 0 || value > 99999999 || detail.length > 1000) {
      return json({ error: "請確認姓名、事項、金額及補充說明格式。" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const recipient = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Payment Hub <onboarding@resend.dev>";
    if (!recipient || !resendKey) return json({ error: "管理者尚未完成 Email 服務設定，請稍後再試。" }, 503);

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const forwarded = req.headers.get("x-forwarded-for") || "unknown";
    const ipHash = await sha256(forwarded.split(",")[0].trim() + (Deno.env.get("RATE_LIMIT_SALT") || serviceKey.slice(0, 16)));
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase.from("debt_submission_limits").select("ip_hash", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 5) return json({ error: "提交次數過多，請一小時後再試。" }, 429);
    const { error: limitError } = await supabase.from("debt_submission_limits").insert({ ip_hash: ipHash });
    if (limitError) throw limitError;

    const { data: record, error: insertError } = await supabase.from("debt_reminders").insert({
      sender_name: sender, subject: title, amount: value, note: detail, status: "pending",
    }).select("id,created_at").single();
    if (insertError) throw insertError;

    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
    const html = `<h2>Payment Hub－收到一筆欠款提醒</h2><p><b>通知人：</b>${escapeHtml(sender)}</p><p><b>欠款事項：</b>${escapeHtml(title)}</p><p><b>欠款金額：</b>NT$ ${value.toLocaleString("zh-TW")}</p><p><b>補充說明：</b>${escapeHtml(detail || "無")}</p><p><b>通知時間：</b>${new Date(record.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><p>請登入 Payment Hub 管理帳號查看及管理紀錄。</p>`;
    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [recipient], subject: `Payment Hub－欠款提醒：${title}`, html }),
    });
    if (!mail.ok) {
      const message = await mail.text();
      // 資料已保存，但郵件失敗；回傳明確訊息，不假裝已寄出。
      return json({ ok: false, saved: true, error: "提醒已保存，但 Email 寄送失敗，請管理者檢查郵件服務。", detail: message }, 502);
    }
    return json({ ok: true, saved: true, id: record.id });
  } catch (error) {
    console.error(error);
    return json({ error: "系統暫時無法處理提醒，請稍後再試。" }, 500);
  }
});
