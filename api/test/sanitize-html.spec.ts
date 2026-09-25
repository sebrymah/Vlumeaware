import { sanitizeHtml } from '../src/common/security/sanitize-html';

describe('R2/R3 · server-side HTML sanitization', () => {
  it('removes <script> elements and their content', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>hi</p>');
    expect(out.toLowerCase()).not.toContain('script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<img src="https://x/y.png" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('rejects javascript: and data: URLs on links', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>').toLowerCase()).not.toContain('javascript:');
    expect(sanitizeHtml('<a href="data:text/html,<script>">x</a>').toLowerCase()).not.toContain('data:');
    // entity-encoded scheme obfuscation
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>').toLowerCase()).not.toContain('alert');
  });

  /**
   * Regression: only the decimal form above used to be covered, while hex,
   * named and control-character obfuscations passed straight through into
   * stored scenario bodies. A browser decodes every form below to
   * `javascript:`. The shared decoder in common/security/entities.ts closes
   * them; test/sanitizer-parity.spec.ts keeps the two sanitizers equal.
   */
  it('rejects every entity-encoded and split form of a dangerous scheme', () => {
    const payloads = [
      '&#x6a;avascript:alert(1)', // hex
      '&#X6A;avascript:alert(1)', // hex, upper case
      '&#x00006a;avascript:alert(1)', // hex, zero padded
      '&#106avascript:alert(1)', // decimal, no semicolon
      'java&Tab;script:alert(1)', // named whitespace
      'java&tab;script:alert(1)', // named whitespace, lower case
      'javascript&colon;alert(1)', // named colon
      'javascript&#x3a;alert(1)', // hex colon
      'jav&#x09;ascript:alert(1)', // hex tab
      'jav&#09;ascript:alert(1)', // decimal tab
      '\u0001javascript:alert(1)', // C0 control prefix
      '  javascript:alert(1)  ', // surrounding whitespace
      '&#118;bscript:msgbox(1)', // obfuscated vbscript
      '&#x64;ata:text/html,x', // obfuscated data:
      'file:///etc/passwd',
    ];
    for (const payload of payloads) {
      expect(sanitizeHtml(`<a href="${payload}">x</a>`)).not.toContain('href=');
      expect(sanitizeHtml(`<img src="${payload}">`)).not.toContain('src=');
    }
  });

  it('keeps legitimate links intact', () => {
    for (const href of [
      'https://acme.example/login',
      'http://acme.example',
      'mailto:it@acme.example',
      '/relative/path',
      '#anchor',
      '{{TRACKING_URL}}',
      'acme/page',
    ]) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`)).toContain(`href="${href}"`);
    }
  });

  it('drops style/iframe/svg/object entirely', () => {
    const out = sanitizeHtml('<style>*{}</style><iframe src=x></iframe><svg/onload=alert(1)><object></object>');
    expect(out.replace(/\s/g, '')).toBe('');
  });

  it('keeps safe formatting and the tracking placeholder', () => {
    const out = sanitizeHtml(
      '<p>Dear {{EMPLOYEE_NAME}},</p><p><strong>Overdue.</strong> <a href="{{TRACKING_URL}}">Pay now</a></p>',
    );
    expect(out).toContain('{{EMPLOYEE_NAME}}');
    expect(out).toContain('href="{{TRACKING_URL}}"');
    expect(out).toContain('<strong>Overdue.</strong>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('unwraps unknown tags but keeps their text', () => {
    const out = sanitizeHtml('<marquee>hello</marquee>');
    expect(out).toBe('hello');
  });

  it('allows https links and images', () => {
    const out = sanitizeHtml('<a href="https://acme.com">a</a><img src="https://acme.com/l.png" alt="logo">');
    expect(out).toContain('href="https://acme.com"');
    expect(out).toContain('src="https://acme.com/l.png"');
    expect(out).toContain('alt="logo"');
  });
});
