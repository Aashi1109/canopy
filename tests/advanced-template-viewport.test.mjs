import assert from "node:assert/strict";
import {
  DESIGNER_ZOOM,
  clampDesignerZoom,
  getCanvasPanSpace,
  getHorizontalRevealDelta,
} from "../app/admin/(protected)/templates/[id]/advanced/lib/designerViewport.ts";

const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

test("zoom supports the expanded range, rounds steps, and safely handles non-finite input", () => {
  assert.equal(clampDesignerZoom(12), 4);
  assert.equal(clampDesignerZoom(-1), 0.4);
  assert.equal(clampDesignerZoom(1.23456), 1.23);
  assert.equal(clampDesignerZoom(0.85 + 0.1), 0.95);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(clampDesignerZoom(invalid), DESIGNER_ZOOM.initial);
  }

  let zoom = DESIGNER_ZOOM.initial;
  for (let index = 0; index < 50; index += 1) zoom = clampDesignerZoom(zoom + DESIGNER_ZOOM.step);
  assert.equal(zoom, DESIGNER_ZOOM.max);
  for (let index = 0; index < 50; index += 1) zoom = clampDesignerZoom(zoom - DESIGNER_ZOOM.step);
  assert.equal(zoom, DESIGNER_ZOOM.min);
});

test("pan space keeps one viewport of reachable gutter around low and high zoom pages", () => {
  const viewport = { width: 1280, height: 500 };
  for (const zoom of [DESIGNER_ZOOM.min, DESIGNER_ZOOM.max]) {
    const paper = { right: 794 * zoom, bottom: 1123 * zoom };
    const space = getCanvasPanSpace(viewport, paper);
    assert.equal(space.gutterX, viewport.width);
    assert.equal(space.gutterY, viewport.height);
    assert.ok(space.width >= paper.right + 2 * viewport.width);
    assert.ok(space.height >= paper.bottom + 2 * viewport.height);
    assert.ok(space.width - viewport.width >= space.gutterX + paper.right);
    assert.ok(space.height - viewport.height >= space.gutterY + paper.bottom);
  }
});

test("pan extents cover the final page and round fractional bounds without shrinking gutters", () => {
  assert.deepEqual(getCanvasPanSpace({ width: 1280, height: 500 }, { right: 317.6, bottom: 2500.2 }), {
    gutterX: 1280,
    gutterY: 500,
    width: 2878,
    height: 3501,
  });
  assert.deepEqual(getCanvasPanSpace({ width: 100, height: 80 }, { right: -10, bottom: -20 }), {
    gutterX: 100,
    gutterY: 80,
    width: 200,
    height: 160,
  });
});

test("fitting fields reveal only their obscured edge and do not move when already visible", () => {
  const visible = { left: 404, right: 920 };
  assert.equal(getHorizontalRevealDelta({ left: 700, right: 950 }, visible), 30);
  assert.equal(getHorizontalRevealDelta({ left: 350, right: 450 }, visible), -54);
  assert.equal(getHorizontalRevealDelta({ left: 404, right: 920 }, visible), 0);
  assert.equal(getHorizontalRevealDelta({ left: 500, right: 600 }, visible), 0);
});

test("both page edges remain reachable around simultaneous left and right overlays at either zoom", () => {
  const viewport = { width: 1280, height: 500 };
  const visible = { left: 404, right: 920 };
  for (const zoom of [DESIGNER_ZOOM.min, DESIGNER_ZOOM.max]) {
    const paper = { right: 794 * zoom, bottom: 1123 * zoom };
    const space = getCanvasPanSpace(viewport, paper);
    const maximumScroll = space.width - viewport.width;
    let scroll = 0;
    let rightField = { left: space.gutterX + paper.right - 40, right: space.gutterX + paper.right };
    const rightDelta = getHorizontalRevealDelta(rightField, visible);
    scroll += rightDelta;
    rightField = { left: rightField.left - rightDelta, right: rightField.right - rightDelta };
    assert.ok(scroll >= 0 && scroll <= maximumScroll);
    assert.equal(getHorizontalRevealDelta(rightField, visible), 0);
    assert.equal(rightField.right, visible.right);

    scroll = maximumScroll;
    let leftField = { left: space.gutterX - scroll, right: space.gutterX + 40 - scroll };
    const leftDelta = getHorizontalRevealDelta(leftField, visible);
    scroll += leftDelta;
    leftField = { left: leftField.left - leftDelta, right: leftField.right - leftDelta };
    assert.ok(scroll >= 0 && scroll <= maximumScroll);
    assert.equal(getHorizontalRevealDelta(leftField, visible), 0);
    assert.equal(leftField.left, visible.left);
  }
});

test("oversized fields keep a visible center without alternating between clipped edges", () => {
  const visible = { left: 0, right: 500 };
  assert.equal(getHorizontalRevealDelta({ left: -100, right: 900 }, visible), 0);
  for (const node of [
    { left: 600, right: 1600 },
    { left: -1200, right: -200 },
    { left: -600, right: 100 },
    { left: 450, right: 1150 },
  ]) {
    const delta = getHorizontalRevealDelta(node, visible);
    const revealed = { left: node.left - delta, right: node.right - delta };
    assert.equal((revealed.left + revealed.right) / 2, 250);
    assert.equal(getHorizontalRevealDelta(revealed, visible), 0);
    assert.equal(getHorizontalRevealDelta(revealed, visible), 0);
  }
});
