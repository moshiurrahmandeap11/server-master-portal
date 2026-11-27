import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface GatewayDispatchResult {
  channel: string;
  deliveredExternally: boolean;
  status: 'sent' | 'logged_in_app' | 'failed';
  provider: string;
  error?: string;
}

/**
 * Dispatches notifications to configured external gateways (SMTP Email, SMS API, WhatsApp Webhook).
 * Never fakes external delivery: accurately reports whether an external provider was invoked.
 */
export async function dispatchExternalNotification(params: {
  channel: string;
  recipientPhone?: string;
  recipientEmails?: string[];
  title: string;
  message: string;
}): Promise<GatewayDispatchResult> {
  const ch = (params.channel || 'in_app').toLowerCase();

  if (ch === 'sms') {
    if (!env.SMS_API_URL || !env.SMS_API_KEY || !params.recipientPhone) {
      return {
        channel: 'sms',
        deliveredExternally: false,
        status: 'logged_in_app',
        provider: 'unconfigured_sms_gateway',
        error: 'SMS_API_URL or SMS_API_KEY not configured in .env',
      };
    }

    try {
      const res = await fetch(env.SMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SMS_API_KEY}`,
        },
        body: JSON.stringify({
          api_key: env.SMS_API_KEY,
          senderid: env.SMS_SENDER_ID || 'ChakriSheba',
          to: params.recipientPhone,
          message: params.message,
        }),
      });

      if (!res.ok) {
        return {
          channel: 'sms',
          deliveredExternally: false,
          status: 'failed',
          provider: 'configured_sms_gateway',
          error: `HTTP ${res.status}`,
        };
      }

      return {
        channel: 'sms',
        deliveredExternally: true,
        status: 'sent',
        provider: 'configured_sms_gateway',
      };
    } catch (err: any) {
      return {
        channel: 'sms',
        deliveredExternally: false,
        status: 'failed',
        provider: 'configured_sms_gateway',
        error: err?.message || 'Network error',
      };
    }
  }

  if (ch === 'whatsapp') {
    if (!env.WHATSAPP_WEBHOOK_URL) {
      return {
        channel: 'whatsapp',
        deliveredExternally: false,
        status: 'logged_in_app',
        provider: 'unconfigured_whatsapp_webhook',
        error: 'WHATSAPP_WEBHOOK_URL not configured in .env',
      };
    }

    try {
      const res = await fetch(env.WHATSAPP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.recipientPhone || 'broadcast',
          title: params.title,
          message: params.message,
        }),
      });
      return {
        channel: 'whatsapp',
        deliveredExternally: res.ok,
        status: res.ok ? 'sent' : 'failed',
        provider: 'whatsapp_webhook',
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    } catch (err: any) {
      return {
        channel: 'whatsapp',
        deliveredExternally: false,
        status: 'failed',
        provider: 'whatsapp_webhook',
        error: err?.message,
      };
    }
  }

  if (ch === 'email' && params.recipientEmails?.length) {
    if (env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL || 'চাকরি সেবা <noreply@moshiur.pro>',
            to: [env.RESEND_FROM_EMAIL?.match(/<([^>]+)>/)?.[1] || 'noreply@moshiur.pro'],
            bcc: params.recipientEmails.slice(0, 50),
            subject: params.title,
            text: params.message,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return {
            channel: 'email',
            deliveredExternally: false,
            status: 'failed',
            provider: 'resend_api',
            error: `HTTP ${res.status}: ${errText}`,
          };
        }
        return {
          channel: 'email',
          deliveredExternally: true,
          status: 'sent',
          provider: 'resend_api',
        };
      } catch (err: any) {
        return {
          channel: 'email',
          deliveredExternally: false,
          status: 'failed',
          provider: 'resend_api',
          error: err?.message,
        };
      }
    }

    if (env.SMTP_USER && env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        });

        await transporter.sendMail({
          from: env.SMTP_FROM,
          bcc: params.recipientEmails.slice(0, 50),
          subject: params.title,
          text: params.message,
        });

        return {
          channel: 'email',
          deliveredExternally: true,
          status: 'sent',
          provider: 'smtp_nodemailer',
        };
      } catch (err: any) {
        return {
          channel: 'email',
          deliveredExternally: false,
          status: 'failed',
          provider: 'smtp_nodemailer',
          error: err?.message,
        };
      }
    }
  }

  return {
    channel: ch,
    deliveredExternally: false,
    status: 'sent',
    provider: 'in_app_database',
  };
}
