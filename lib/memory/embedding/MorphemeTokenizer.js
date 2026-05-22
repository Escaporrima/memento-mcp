/**
 * MorphemeTokenizer — 유니코드 스크립트 분할 + 언어별 로컬 분석기 라우팅
 *
 * 작성자: 최진호
 * 작성일: 2026-05-22
 */

/** 스크립트 분류용 유니코드 범위 */
const RANGES = [
  ["hangul", /[가-힣ᄀ-ᇿ㄰-㆏]/],
  ["kana",   /[぀-ヿㇰ-ㇿ]/],
  ["han",    /[一-鿿㐀-䶿]/],
  ["latin",  /[A-Za-z]/],
];

/** 라틴 런에서 코드 식별자(memento-mcp, L3)를 보존하기 위해 영숫자·하이픈·언더스코어를 한 런으로 묶는다 */
function scriptOf(ch) {
  for (const [name, re] of RANGES) if (re.test(ch)) return name;
  if (/[0-9]/.test(ch)) return "latinnum";    // 라틴 인접 숫자 — 라틴 런에만 흡수, 단독 시 other
  return "other";
}

/**
 * 텍스트를 동일 스크립트 연속 런으로 분할한다.
 * 라틴 런은 영숫자·하이픈·언더스코어를 포함해 코드 토큰을 보존한다.
 *
 * @param {string} text
 * @returns {{script: string, text: string}[]}
 */
export function segmentByScript(text) {
  const segs = [];
  let cur = null;
  const flush = () => { if (cur && cur.text.trim()) segs.push({ script: cur.script === "latinnum" ? "latin" : cur.script, text: cur.text }); cur = null; };

  const latinFamily = (a, b) =>
    (a === "latin" || a === "latinnum") && (b === "latin" || b === "latinnum");

  for (const ch of String(text)) {
    const raw = scriptOf(ch);

    /** 하이픈/언더스코어는 현재 라틴 런 안에서만 연결 문자로 작동 */
    const isLatinGlue = /[-_]/.test(ch) && cur && (cur.script === "latin" || cur.script === "latinnum");

    /**
     * latinnum은 라틴 런 안에 있을 때만 흡수. 그 외(가나·한자 뒤 등)에서는 other로 강등.
     * isLatinGlue이면 현재 라틴 런의 스크립트를 그대로 유지.
     */
    let s;
    if (isLatinGlue) {
      s = cur.script;
    } else if (raw === "latinnum") {
      s = (cur && (cur.script === "latin" || cur.script === "latinnum")) ? "latinnum" : "other";
    } else {
      s = raw;
    }

    if (!cur) {
      if (s !== "other") cur = { script: s, text: ch };
      else if (ch.trim()) cur = { script: "other", text: ch };
      continue;
    }

    /** 같은 스크립트(또는 라틴 패밀리)면 합친다 */
    if (cur.script === s || latinFamily(cur.script, s)) {
      cur.text += ch;
      if (s === "latinnum") cur.script = "latin";
      continue;
    }

    /** 스크립트 전환 — 현재 런 flush 후 새 런 시작 */
    flush();
    if (s !== "other") cur = { script: s, text: ch };
    else if (ch.trim()) cur = { script: "other", text: ch };
  }
  flush();
  return segs;
}
