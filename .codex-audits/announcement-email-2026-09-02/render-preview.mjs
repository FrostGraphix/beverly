import fs from 'node:fs';
import { adminAnnouncementEmail } from '../../backend/wallet/dist/emails/templates.js';

const email = adminAnnouncementEmail({
  name: 'Beverly User',
  title: 'Welcome Onboard Beverlites!',
  body: `Welcome to Beverly! We’re excited to have you with us.

Beverly is designed to give you a simple, seamless, and enjoyable experience from the moment you get started. Your account is now ready, and you can begin exploring everything Beverly has to offer.

Get started with Beverly today:
1. Complete your profile
2. Explore available features and services
3. Personalize your experience
4. Reach out to our support team whenever you need assistance

Thank you for choosing Beverly. We’re glad to have you as part of our growing community.

Warm regards,
The Beverly Team`,
});

const logo = fs.readFileSync(new URL('../../backend/wallet/src/emails/assets/beverly-logo.png', import.meta.url)).toString('base64');
const html = email.html.replace('cid:beverly-logo', `data:image/png;base64,${logo}`);
fs.writeFileSync(new URL('./preview.html', import.meta.url), html);
