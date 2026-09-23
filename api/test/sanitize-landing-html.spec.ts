import { sanitizeLandingHtml } from '../src/common/security/sanitize-landing-html';

describe('sanitizeLandingHtml', () => {
  it('removes <script> and its contents', () => {
    const out = sanitizeLandingHtml('<div>hi<script>steal()</script></div>');
    expect(out).not.toMatch(/script/i);
    expect(out).not.toContain('steal');
    expect(out).toContain('hi');
  });

  it('removes credential-capturing form elements entirely', () => {
    const out = sanitizeLandingHtml(
      '<form action="https://evil.test/collect"><input name="pw" type="password"><button>Go</button></form>',
    );
    expect(out).not.toMatch(/<form|<input|<button/i);
    expect(out).not.toContain('evil.test');
  });

  it('strips on* event handlers but keeps the element', () => {
    const out = sanitizeLandingHtml('<div onclick="x()" style="color:red">hey</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain('hey');
    expect(out).toContain('color:red');
  });

  it('keeps inline styles for visual fidelity', () => {
    const out = sanitizeLandingHtml('<div style="background:#0067b8;padding:20px">Sign in</div>');
    expect(out).toContain('background:#0067b8');
  });

  it('scrubs dangerous CSS from <style> and style attributes', () => {
    const out = sanitizeLandingHtml(
      '<style>@import url(//evil);a{background:expression(alert(1))}</style>' +
        '<div style="background:url(javascript:alert(1))">x</div>',
    );
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).not.toMatch(/url\(\s*['"]?javascript:/i);
  });

  it('rejects javascript: and non-image data: URLs on links and images', () => {
    const out = sanitizeLandingHtml(
      '<a href="javascript:alert(1)">a</a><img src="data:text/html,<script>1</script>">',
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it('preserves the {{LOGIN_FORM}} marker and allowed layout/images', () => {
    const out = sanitizeLandingHtml(
      '<section><h1>Acme</h1><img src="https://cdn.acme.test/logo.png" alt="Acme">{{LOGIN_FORM}}</section>',
    );
    expect(out).toContain('{{LOGIN_FORM}}');
    expect(out).toContain('<h1>Acme</h1>');
    expect(out).toContain('https://cdn.acme.test/logo.png');
    expect(out).toContain('<section>');
  });

  it('unwraps unknown tags but keeps their text', () => {
    const out = sanitizeLandingHtml('<marquee>scroll</marquee>');
    expect(out).not.toMatch(/marquee/i);
    expect(out).toContain('scroll');
  });
});
