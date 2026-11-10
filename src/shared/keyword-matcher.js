(() => {
  "use strict";
  if (globalThis.DCBKeywordMatcher) return;

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function prepareKeywords(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.flatMap((raw) => {
      const label = String(raw || "").normalize("NFKC").trim();
      const needle = normalizeText(label);
      if (!needle || seen.has(needle)) return [];
      seen.add(needle);
      return [{ label, needle }];
    });
  }

  // Category-only rules. Ambiguous short words require a token boundary and
  // accept common Korean particles without matching longer unrelated words.
  const start = String.raw`(?<![\p{L}\p{N}])`;
  const end = String.raw`(?:에서|으로|에게|까지|부터|처럼|보다|에도|에는|은|는|이|가|을|를|에|의|와|과|도|로|들)?(?![\p{L}\p{N}])`;
  const parties = ["민주당", "국민의힘", "조국혁신당", "개혁신당", "정의당", "진보당"];
  const politicians = ["이재명", "윤석열", "문재인", "박근혜"];
  const dictionary = {
    profanity: {
      label: "욕설", terms: ["씨발", "씨팔", "개새끼", "개색끼", "개쉐끼", "개자식", "븅신", "지랄", "존나", "좆같", "좃같", "좆까", "빡대가리", "미친놈", "미친년", "미친새끼"],
      words: ["시팔", "씨바", "ㅅㅂ", "ㅆㅂ", "ㅂㅅ", "ㅈㄹ", "ㅈㄴ"],
      patterns: [start + "시발(?! *(?:점|역|지|차|열차|버스|행))", start + "병신(?! *(?:년|일주))", "[씨시][1!]+발"]
    },
    politics: {
      label: "정치", terms: ["대통령", "국회의원", "국회법", "국정감사", "지방선거", "정치인", "정치권", "정치질", "정치판", "정치적", "정치 뉴스", "정당정치", "정당법", "대선 후보", "총선 후보", "여야 합의", "탄핵소추", "공천심사", ...parties],
      words: ["정치", "국회", "여당", "야당", "대선", "총선", "탄핵", "공천", ...politicians],
      patterns: [start + "정당(?! *(?:방위|행위))" + end]
    },
    poll: {
      label: "투표", terms: ["투표", "설문 조사", "설문 참여", "설문 응답"], words: ["갤투"]
    },
    promotion: {
      label: "광고·홍보", terms: ["광고글", "홍보글", "체험단 모집", "공동구매 모집", "공구 모집", "가입 코드", "추천인 코드", "레퍼럴 링크", "쿠폰 코드", "제휴 링크", "오픈채팅 문의", "부업 모집", "재택 부업", "수익 보장"]
    },
    hate: {
      label: "혐오 표현", terms: ["한남충", "한녀충", "틀딱충", "급식충", "잼민충", "맘충", "김치녀", "똥양인", "쪽바리", "짱깨", "깜둥이", "홍어새끼", "전라디언", "경상디언", "장애충", "정공새끼"]
    }
  };
  const compiled = new Map();
  function alternatives(terms) {
    return [...new Set(terms.map(normalizeText))].map(term =>
      term.replace(/[.*+?^${}|()[\]\\]/g, "\\$&").replaceAll(" ", " *")
    ).join("|");
  }
  function prepareCategories(flags) {
    const active = [];
    for (const [id, rule] of Object.entries(dictionary)) {
      if (flags?.[id] !== true) continue;
      if (!compiled.has(id)) {
        const parts = [alternatives(rule.terms), ...(rule.patterns || [])];
        if (rule.words) parts.push(start + "(?:" + alternatives(rule.words) + ")" + end);
        compiled.set(id, { label: rule.label, needle: "category:" + id, pattern: new RegExp(parts.join("|"), "u") });
      }
      active.push(compiled.get(id));
    }
    return active;
  }

  function findKeyword(text, keywords) {
    const haystack = normalizeText(text);
    return haystack ? keywords.find(keyword => keyword.pattern ? keyword.pattern.test(haystack) : haystack.includes(keyword.needle)) || null : null;
  }

  globalThis.DCBKeywordMatcher = Object.freeze({ normalizeText, prepareKeywords, prepareCategories, findKeyword });
})();
