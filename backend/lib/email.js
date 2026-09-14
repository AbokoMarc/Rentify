// Envoi d'email via Resend (https://resend.com) — 3 000 emails/mois gratuits à vie, 100/jour, sans CB.
// ⚠️ Écrit avec soin mais PAS testé en conditions réelles (pas d'accès réseau en dev).
//
// Comment activer :
// 1. Crée un compte sur resend.com (gratuit, pas de carte bancaire)
// 2. Ajoute et vérifie ton domaine (ou utilise le domaine de test fourni par Resend pour commencer,
//    limité à t'envoyer des emails à toi-même — vérifie un vrai domaine dès que possible pour la prod)
// 3. Crée une clé API ("API Keys" → "Create API Key")
// 4. Renseigne dans .env : RESEND_API_KEY=re_... et EMAIL_FROM=Lokaya <noreply@tondomaine.cm>
//
// Sans ces variables, l'app continue de fonctionner normalement : la vérification d'email est
// simplement désactivée (email_verified reste à 0, sans bloquer quoi que ce soit).

export function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured()) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Échec de l'envoi de l'email.");
  return data;
}

function emailShell(title, bodyHtml) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:22px;font-weight:700;color:#241A12;margin-bottom:24px">Lokaya</div>
    <h2 style="color:#241A12;font-size:18px">${title}</h2>
    <div style="color:#333;font-size:15px;line-height:1.6">${bodyHtml}</div>
    <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
      Lokaya — Location, achat et réservation de logements au Cameroun.
    </p>
  </div>`;
}

export async function sendVerificationEmail(user, token, baseUrl) {
  const link = `${baseUrl}/verify-email.html?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Confirme ton adresse email — Lokaya',
    html: emailShell('Confirme ton adresse email', `
      <p>Bonjour ${user.name},</p>
      <p>Merci de t'être inscrit(e) sur Lokaya. Clique sur le bouton ci-dessous pour confirmer ton adresse email :</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#C9781E;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Confirmer mon email</a></p>
      <p style="font-size:13px;color:#777">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur : ${link}</p>
    `),
  });
}

export async function sendTempPasswordEmail(user, tempPassword) {
  await sendEmail({
    to: user.email,
    subject: 'Ton nouveau mot de passe temporaire — Lokaya',
    html: emailShell('Nouveau mot de passe temporaire', `
      <p>Bonjour ${user.name},</p>
      <p>Voici ton mot de passe temporaire pour te reconnecter à Lokaya :</p>
      <p style="margin:20px 0;font-size:20px;font-weight:700;letter-spacing:1px;background:#F1E3CC;padding:14px;border-radius:8px;text-align:center">${tempPassword}</p>
      <p>Il te sera demandé de le changer dès ta prochaine connexion, pour ta sécurité.</p>
    `),
  });
}
