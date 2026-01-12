import { describe, it, expect } from "vitest";
import { getOverlayScaleFactors } from "../src/runtime";

describe("getOverlayScaleFactors", () => {
  it("returns full scale with zero offsets when dimensions missing", () => {
    const result = getOverlayScaleFactors(800, 600, null);
    expect(result).toEqual({
      scaleX: 800,
      scaleY: 600,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("adds vertical offset when doc is wider than canvas", () => {
    const result = getOverlayScaleFactors(1000, 1200, {
      width: 1000,
      height: 1000,
    });

    expect(result.scaleX).toBeCloseTo(1000);
    expect(result.scaleY).toBeCloseTo(1000);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(100);
  });

  it("adds horizontal offset when doc is taller than canvas", () => {
    const result = getOverlayScaleFactors(1200, 1000, {
      width: 1000,
      height: 1000,
    });

    expect(result.scaleX).toBeCloseTo(1000);
    expect(result.scaleY).toBeCloseTo(1000);
    expect(result.offsetX).toBeCloseTo(100);
    expect(result.offsetY).toBeCloseTo(0);
  });

  it("maps normalized bounds into content area", () => {
    const { scaleX, scaleY, offsetX, offsetY } = getOverlayScaleFactors(
      1000,
      1200,
      { width: 1000, height: 1000 },
    );

    const bbox = { x: 0, y: 0, width: 1, height: 1 };
    const left = offsetX + bbox.x * scaleX;
    const top = offsetY + bbox.y * scaleY;
    const width = bbox.width * scaleX;
    const height = bbox.height * scaleY;

    expect(left).toBeCloseTo(0);
    expect(top).toBeCloseTo(100);
    expect(width).toBeCloseTo(1000);
    expect(height).toBeCloseTo(1000);
  });
});
