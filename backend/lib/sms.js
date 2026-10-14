// Envoi de SMS. Fournisseur choisi par variables d'environnement :
//   SMS_PROVIDER=twilio  + TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// Sans fournisseur : en développement le code est écrit dans la console du serveur ; en production l'envoi est refusé
// (on ne prétend jamais avoir envoyé un SMS qui n'est pas parti).
export function isSmsConfigured() {
  return process.env.SMS_PROVIDER === 'twilio' && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM;
}

export async function sendSms(to, text) {
  if (isSmsConfigured()) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: text }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    return { sent: true };
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SMS DEV] à ${to} : ${text}`);
    return { sent: true, dev: true };
  }
  throw new Error('SMS non configuré');
}
