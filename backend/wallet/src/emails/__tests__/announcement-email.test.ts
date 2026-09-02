import { describe, expect, it } from 'vitest';
import { adminAnnouncementEmail } from '../templates.js';

describe('admin announcement email', () => {
    it('embeds a reliable Beverly logo with dark-mode support', () => {
        const email = adminAnnouncementEmail({
            name: 'Beverly User',
            title: 'Service update',
            body: 'Everything is ready.',
        });

        expect(email.html).toContain('src="cid:beverly-logo"');
        expect(email.html).toContain('name="color-scheme" content="light dark"');
        expect(email.html).toContain('@media (prefers-color-scheme: dark)');
        expect(email.html).toContain('class="beverly-logo-shell"');
    });

    it('preserves paragraphs and formats numbered instructions', () => {
        const email = adminAnnouncementEmail({
            name: 'Beverly User',
            title: 'Welcome',
            body: 'Your account is ready.\n\nGet started today:\n1. Complete your profile\n2. Explore available services\n3. Contact support',
        });

        expect(email.html).toContain('<p style="margin:0 0 18px;">Your account is ready.</p>');
        expect(email.html).toContain('<ol');
        expect(email.html).toContain('<li style="margin:0 0 8px;">Complete your profile</li>');
        expect(email.text).toContain('1. Complete your profile\n2. Explore available services');
    });

    it('removes repeated Beverly sign-offs', () => {
        const email = adminAnnouncementEmail({
            name: 'Beverly User',
            title: 'Welcome',
            body: 'Thanks for joining. Warm regards, The Beverly Team',
        });

        expect(email.html.match(/The Beverly Team/g)).toHaveLength(1);
        expect(email.text.match(/The Beverly Team/g)).toHaveLength(1);
        expect(email.html).not.toContain('Warm regards');
    });

    it('escapes untrusted announcement content', () => {
        const email = adminAnnouncementEmail({
            name: '<Admin>',
            title: '<script>alert(1)</script>',
            body: '<img src=x onerror=alert(1)>',
        });

        expect(email.html).not.toContain('<script>');
        expect(email.html).not.toContain('<img src=x');
        expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
});
