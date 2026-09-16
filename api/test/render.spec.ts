import { renderScenario } from '../src/modules/tracking/render';

describe('renderScenario', () => {
  const body = '<p>Hi {{EMPLOYEE_NAME}}, <a href="{{TRACKING_URL}}">review</a></p>';
  const vars = {
    trackingUrl: 'https://trk.test/track/click/abc',
    pixelUrl: 'https://trk.test/track/open/abc',
    employeeName: 'Amina Bello',
  };

  it('substitutes the tracking url and employee name', () => {
    const html = renderScenario(body, vars);
    expect(html).toContain('href="https://trk.test/track/click/abc"');
    expect(html).toContain('Hi Amina Bello');
    expect(html).not.toContain('{{');
  });

  it('appends the open pixel', () => {
    expect(renderScenario(body, vars)).toContain('https://trk.test/track/open/abc');
  });

  it('places the pixel inside body when one exists', () => {
    const html = renderScenario(`<html><body>${body}</body></html>`, vars);
    expect(html.indexOf('track/open')).toBeLessThan(html.indexOf('</body>'));
  });

  it('escapes employee names so an imported CSV cannot inject markup', () => {
    const html = renderScenario(body, {
      ...vars,
      employeeName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('replaces every occurrence of the tracking placeholder', () => {
    const html = renderScenario('<a href="{{TRACKING_URL}}">a</a><a href="{{TRACKING_URL}}">b</a>', vars);
    expect(html.match(/track\/click\/abc/g)).toHaveLength(2);
  });
});
