import { describe, expect, test } from "bun:test";
import {
  assemblePriceFromFragments,
  buildResizeHandleCandidates,
  buildFullCanvasCropPlan,
  deriveCursorBounds,
  evaluateResizeCoverage,
  isLikelyCropCanvasRect,
  limitSearchResults,
  pickBestCursorProbePoint,
  pickResizeStartFromBounds,
} from "./1688_engine";

describe("buildFullCanvasCropPlan", () => {
  test("moves selection box to canvas top-left and stretches to bottom-right", () => {
    const plan = buildFullCanvasCropPlan(
      {
        left: 220,
        top: 140,
        right: 420,
        bottom: 340,
        width: 200,
        height: 200,
      },
      {
        left: 120,
        top: 80,
        right: 620,
        bottom: 480,
        width: 500,
        height: 400,
      },
    );

    expect(plan.moveEnd).toEqual({ x: 226, y: 186 });
    expect(plan.resizeEnd).toEqual({ x: 614, y: 474 });
    expect(plan.moveStart).toEqual({ x: 320, y: 240 });
    expect(plan.resizeStart).toEqual({ x: 416, y: 336 });
  });

  test("clamps drag points inside the canvas even when selection edges are out of bounds", () => {
    const plan = buildFullCanvasCropPlan(
      {
        left: 80,
        top: 60,
        right: 300,
        bottom: 260,
        width: 220,
        height: 200,
      },
      {
        left: 100,
        top: 90,
        right: 500,
        bottom: 390,
        width: 400,
        height: 300,
      },
    );

    expect(plan.moveStart.x).toBeGreaterThanOrEqual(106);
    expect(plan.moveStart.y).toBeGreaterThanOrEqual(96);
    expect(plan.resizeStart.x).toBeGreaterThanOrEqual(106);
    expect(plan.resizeStart.y).toBeGreaterThanOrEqual(96);
    expect(plan.resizeStart.x).toBeLessThanOrEqual(494);
    expect(plan.resizeStart.y).toBeLessThanOrEqual(384);
  });
});

describe("limitSearchResults", () => {
  test("keeps page order and returns only first 36 items by default", () => {
    const data = Array.from({ length: 25 }, (_, index) => ({
      title: `item-${index}`,
      price: "¥1",
      sales: "",
      moq: "",
      shopName: "shop",
      itemUrl: `https://detail.1688.com/offer/${index}.html`,
      imageUrl: "",
      isAd: false,
      cosScore: 1 - index * 0.01,
    }));

    const limited = limitSearchResults(data);
    expect(limited).toHaveLength(25);
    expect(limited[0]?.title).toBe("item-0");
    expect(limited[24]?.title).toBe("item-24");
  });

  test("returns first 36 items when source has more than 36", () => {
    const data = Array.from({ length: 50 }, (_, index) => ({
      title: `item-${index}`,
      price: "¥1",
      sales: "",
      moq: "",
      shopName: "shop",
      itemUrl: `https://detail.1688.com/offer/${index}.html`,
      imageUrl: "",
      isAd: false,
      cosScore: 1 - index * 0.01,
    }));

    const limited = limitSearchResults(data);
    expect(limited).toHaveLength(36);
    expect(limited[0]?.title).toBe("item-0");
    expect(limited[35]?.title).toBe("item-35");
  });
});

describe("pickBestCursorProbePoint", () => {
  test("prefers center-like move cursor points", () => {
    const picked = pickBestCursorProbePoint(
      [
        { x: 110, y: 110, cursor: "move" },
        { x: 260, y: 230, cursor: "move" },
        { x: 380, y: 370, cursor: "move" },
      ],
      "move",
      { left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 },
    );

    expect(picked).toEqual({ x: 260, y: 230 });
  });

  test("prefers bottom-right resize cursor points", () => {
    const picked = pickBestCursorProbePoint(
      [
        { x: 140, y: 150, cursor: "nwse-resize" },
        { x: 260, y: 290, cursor: "se-resize" },
        { x: 330, y: 350, cursor: "nesw-resize" },
      ],
      "resize",
      { left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 },
    );

    expect(picked).toEqual({ x: 330, y: 350 });
  });
});

describe("deriveCursorBounds and pickResizeStartFromBounds", () => {
  test("derives move bounds from move probes", () => {
    const bounds = deriveCursorBounds(
      [
        { x: 110, y: 120, cursor: "move" },
        { x: 210, y: 125, cursor: "move" },
        { x: 205, y: 260, cursor: "move" },
        { x: 120, y: 250, cursor: "move" },
        { x: 260, y: 260, cursor: "default" },
      ],
      "move",
    );

    expect(bounds).toEqual({
      left: 110,
      top: 120,
      right: 210,
      bottom: 260,
      width: 100,
      height: 140,
    });
  });

  test("picks resize start near move bounds bottom-right and clamps inside canvas", () => {
    const point = pickResizeStartFromBounds(
      { left: 110, top: 120, right: 210, bottom: 260, width: 100, height: 140 },
      { left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200 },
    );

    expect(point).toEqual({ x: 214, y: 264 });
  });
});

describe("isLikelyCropCanvasRect", () => {
  test("accepts main crop canvas size and rejects tiny thumbnail-like canvas", () => {
    expect(
      isLikelyCropCanvasRect({
        left: 100,
        top: 100,
        right: 400,
        bottom: 400,
        width: 300,
        height: 300,
      }),
    ).toBe(true);

    expect(
      isLikelyCropCanvasRect({
        left: 100,
        top: 100,
        right: 190,
        bottom: 190,
        width: 90,
        height: 90,
      }),
    ).toBe(false);
  });
});

describe("evaluateResizeCoverage", () => {
  test("fails when second drag only moved selection without resizing", () => {
    const result = evaluateResizeCoverage(
      { left: 120, top: 120, right: 200, bottom: 220, width: 80, height: 100 },
      { left: 220, top: 220, right: 300, bottom: 320, width: 80, height: 100 },
      { left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 },
    );

    expect(result.ok).toBe(false);
  });

  test("passes when only horizontal growth is needed because vertical coverage is already high", () => {
    const result = evaluateResizeCoverage(
      { left: 762, top: 178, right: 846, bottom: 449, width: 84, height: 271 },
      { left: 762, top: 178, right: 1013, bottom: 449, width: 251, height: 271 },
      { left: 737.5, top: 174, right: 1037.5, bottom: 474, width: 300, height: 300 },
    );

    expect(result.ok).toBe(true);
  });

  test("passes when selection grows to cover most of canvas", () => {
    const result = evaluateResizeCoverage(
      { left: 120, top: 120, right: 200, bottom: 220, width: 80, height: 100 },
      { left: 110, top: 110, right: 388, bottom: 390, width: 278, height: 280 },
      { left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 },
    );

    expect(result.ok).toBe(true);
  });
});

describe("buildResizeHandleCandidates", () => {
  test("builds corner-first candidate points and clamps into canvas", () => {
    const points = buildResizeHandleCandidates(
      { left: 120, top: 120, right: 200, bottom: 220, width: 80, height: 100 },
      { left: 100, top: 100, right: 260, bottom: 260, width: 160, height: 160 },
      6,
      3,
    );

    expect(points[0]).toEqual({ x: 200, y: 220 });
    expect(points.some((p) => p.x === 206 && p.y === 223)).toBe(true);
    expect(points.every((p) => p.x >= 106 && p.x <= 254 && p.y >= 106 && p.y <= 254)).toBe(true);
  });
});

describe("assemblePriceFromFragments", () => {
  test("joins integer and decimal fragments after the yuan symbol", () => {
    expect(assemblePriceFromFragments("3", ".5", "")).toBe("3.5");
  });

  test("falls back to legacy price text when fragments are missing", () => {
    expect(assemblePriceFromFragments("", "", "¥12.80/件")).toBe("12.80");
  });
});
