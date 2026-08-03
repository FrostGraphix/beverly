const assert = require('node:assert/strict');
const path = require('node:path');

async function runTests() {
    console.log('Testing email validation and security functions...');

    // Dynamic import ESM email-validation module
    const emailVal = await import('../backend/wallet/dist/services/email-validation.js').catch(async () => {
        // Fallback to ts-node / typescript source directly if dist not built yet
        return require('tsx/cjs').require('../backend/wallet/src/services/email-validation.ts');
    });

    const { isDisposableEmail, isCorporateStaffEmail, validateEmailFormatAndDomain, EmailValidationError } = emailVal;

    // 1. Test disposable email detection
    assert.equal(isDisposableEmail('user@mailinator.com'), true, 'mailinator.com should be disposable');
    assert.equal(isDisposableEmail('user@tempmail.com'), true, 'tempmail.com should be disposable');
    assert.equal(isDisposableEmail('user@yopmail.com'), true, 'yopmail.com should be disposable');
    assert.equal(isDisposableEmail('user@acoblighting.com'), false, 'acoblighting.com is NOT disposable');
    assert.equal(isDisposableEmail('user@gmail.com'), false, 'gmail.com is NOT disposable');
    console.log('  ✓ Disposable email detection passed');

    // 2. Test staff corporate domain validation
    assert.equal(isCorporateStaffEmail('admin@acoblighting.com'), true, '@acoblighting.com must pass as corporate staff email');
    assert.equal(isCorporateStaffEmail('staff@org.acoblighting.com'), true, '@org.acoblighting.com must pass as corporate staff email');
    assert.equal(isCorporateStaffEmail('hacker@gmail.com'), false, '@gmail.com must fail corporate staff validation');
    assert.equal(isCorporateStaffEmail('attacker@yahoo.com'), false, '@yahoo.com must fail corporate staff validation');
    console.log('  ✓ Corporate staff domain lockdown passed');

    // 3. Test validateEmailFormatAndDomain with invalid syntax & disposable emails
    await assert.rejects(
        async () => validateEmailFormatAndDomain('invalid-email-string'),
        (err) => err.code === 'invalid_email',
        'Invalid syntax should throw invalid_email'
    );

    await assert.rejects(
        async () => validateEmailFormatAndDomain('spammer@tempmail.com'),
        (err) => err.code === 'disposable_email_not_allowed',
        'Disposable email should throw disposable_email_not_allowed'
    );

    const validResult = await validateEmailFormatAndDomain('valid.user@acoblighting.com');
    assert.equal(validResult, 'valid.user@acoblighting.com', 'Valid corporate email should pass validation');
    console.log('  ✓ Email format and domain validation passed');

    console.log('All email verification & security tests passed successfully!');
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
