# SMS Delivery Setup

This app uses two separate Twilio SMS paths.

## OTP SMS

Customer login, signup, and step-up verification use Twilio Verify.

Required env:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

Current Verify branding is configured in Twilio as `Beverly` with 6-digit codes and the do-not-share warning enabled.

## Token Purchase SMS

Electricity-token delivery and receipt resend use Programmable Messaging.

Required env:

```env
TWILIO_TOKEN_SMS_FROM_NUMBER=+17623353077
```

Optional fallback:

```env
TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID=
```

Leave `TWILIO_TOKEN_SMS_MESSAGING_SERVICE_SID` blank unless the Messaging Service has the approved sender/header you want customers to see. The token SMS body is generated in `backend/wallet/src/services/customer-purchase.ts`.

## Current Customer-Facing Token Message

```text
Beverly token purchase successful.
Token: <token>
Meter: <meter>
Amount: <amount>
Units: <units> kWh
Receipt: <receipt>
Keep this token safe. Beverly will never ask for your verification code.
```
