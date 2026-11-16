import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function getInlineScript(file: string, attribute: string) {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8');
  const match = html.match(new RegExp('<script data-localvert-route-' + attribute + '>([\\s\\S]*?)<\\/script>'));
  assert.ok(match, 'Missing route script in ' + file);
  return match[1];
}

const fallback = getInlineScript('../public/404.html', 'fallback');
const restore = getInlineScript('../index.html', 'restore');

function navigateFromDirectLink(requested: string) {
  const original = new URL(requested, 'https://localvert.columbina.kr');
  let redirected: URL | null = null;
  runInNewContext(fallback, {
    encodeURIComponent,
    window: {
      location: {
        pathname: original.pathname,
        search: original.search,
        hash: original.hash,
        replace: (value: string) => { redirected = new URL(value, original.origin); },
      },
    },
  });
  assert.ok(redirected, '404 fallback did not redirect');
  assert.equal(redirected.pathname, '/');
  assert.ok(redirected.searchParams.has('__localvert_path'));
  let restored: URL | null = null;
  runInNewContext(restore, {
    URL,
    window: {
      location: { href: redirected.href },
      history: {
        state: { retained: true },
        replaceState: (_state: unknown, _title: string, url: string) => {
          restored = new URL(url, original.origin);
        },
      },
    },
  });
  assert.ok(restored, 'index did not recover the deep URL');
  return restored.href;
}

test('GitHub Pages deep links restore all tool and detail routes', () => {
  for (const path of ['/upscale', '/compress', '/details', '/세부페이지']) {
    const original = new URL(path, 'https://localvert.columbina.kr');
    assert.equal(navigateFromDirectLink(path), original.href);
  }
});

test('direct /upscale URL preserves advertising parameters and hash', () => {
  const path = '/upscale?utm_source=chatgpt.com&filename=photo%20one.png#models';
  assert.equal(navigateFromDirectLink(path), 'https://localvert.columbina.kr' + path);
});

test('trailing slash links normalize to the actual BrowserRouter path', () => {
  assert.equal(navigateFromDirectLink('/upscale/?view=photo#tier'),
    'https://localvert.columbina.kr/upscale?view=photo#tier');
});

test('unknown routes are handed to the app router instead of the Pages error page', () => {
  assert.equal(navigateFromDirectLink('/missing/path?from=share'),
    'https://localvert.columbina.kr/missing/path?from=share');
});

test('root without redirect marker is not modified', () => {
  let called = false;
  runInNewContext(restore, {
    URL,
    window: {
      location: { href: 'https://localvert.columbina.kr/?utm_source=chatgpt.com' },
      history: { state: null, replaceState: () => { called = true; } },
    },
  });
  assert.equal(called, false);
});

test('reject protocol-relative and cross-site restore payloads', () => {
  for (const payload of ['//external.example/steal', 'https://external.example/path']) {
    let called = false;
    runInNewContext(restore, {
      URL,
      window: {
        location: { href: 'https://localvert.columbina.kr/?__localvert_path=' + encodeURIComponent(payload) },
        history: { state: null, replaceState: () => { called = true; } },
      },
    });
    assert.equal(called, false);
  }
});
