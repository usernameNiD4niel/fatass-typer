import { expect, test } from '@playwright/test';

/**
 * WebGL availability in CI.
 *
 * The run screen is a Three.js scene, so every gameplay test downstream of this
 * one depends on headless Chromium actually producing a WebGL context. It does
 * not do that by default — there is no GPU, and Chromium declines to fall back
 * to SwiftShader for WebGL unless told to. The launch flags that tell it to live
 * in `playwright.config.ts`.
 *
 * This test exists so that when they stop working, the failure says "no WebGL"
 * instead of "the canvas was blank", which is a far longer afternoon.
 */

interface WebGlProbe {
  readonly supported: boolean;
  readonly version: string;
  readonly renderer: string;
  readonly drewSomething: boolean;
}

test.describe('WebGL support', () => {
  test('headless Chromium provides a WebGL2 context that can draw', async ({ page }) => {
    await page.goto('/');

    const probe = await page.evaluate<WebGlProbe>(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;

      const gl = canvas.getContext('webgl2');
      if (!gl) {
        return { supported: false, version: '', renderer: '', drewSomething: false };
      }

      // Clear to a known colour and read the pixel back. A context that reports
      // success but renders nothing is the failure mode worth catching.
      gl.clearColor(0.25, 0.5, 0.75, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer =
        debugInfo === null
          ? String(gl.getParameter(gl.RENDERER))
          : String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));

      const green = pixel[1] ?? 0;
      const alpha = pixel[3] ?? 0;

      return {
        supported: true,
        version: String(gl.getParameter(gl.VERSION)),
        renderer,
        // 0.5 in linear float lands near 128 after the byte round-trip.
        drewSomething: green > 100 && green < 160 && alpha === 255,
      };
    });

    expect(probe.supported, 'no WebGL2 context — check the SwiftShader launch args').toBe(true);
    expect(probe.version).toContain('WebGL');
    expect(probe.renderer.length).toBeGreaterThan(0);
    expect(probe.drewSomething, 'context created but readPixels came back wrong').toBe(true);
  });
});
