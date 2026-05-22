import { test, describe } from "node:test";
import assert             from "node:assert/strict";
import { segmentByScript } from "../../lib/memory/embedding/MorphemeTokenizer.js";

describe("segmentByScript", () => {
  test("한·영 혼용을 스크립트 런으로 분리", () => {
    const segs = segmentByScript("memento 임베딩 비용");
    assert.deepEqual(segs, [
      { script: "latin",  text: "memento" },
      { script: "hangul", text: "임베딩" },
      { script: "hangul", text: "비용" },
    ]);
  });

  test("한자·가나·숫자 분류", () => {
    const segs = segmentByScript("中文テスト123");
    assert.deepEqual(segs.map(s => s.script), ["han", "kana", "other"]);
  });

  test("코드 토큰 memento-mcp는 라틴 런으로 유지", () => {
    const segs = segmentByScript("memento-mcp L3");
    assert.equal(segs[0].script, "latin");
    assert.ok(segs.some(s => s.text.includes("memento-mcp")));
  });
});
