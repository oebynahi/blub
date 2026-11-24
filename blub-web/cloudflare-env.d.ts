declare namespace Cloudflare {
  interface Env {
    APNS_TEAM_ID?: string;
    APNS_KEY_ID?: string;
    APNS_PRIVATE_KEY?: string;
    RESEND_API_KEY?: string;
    BLUB_EMAIL_FROM?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
