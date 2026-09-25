(() => {
  "use strict";
  function create(config) {
    if (config?.version !== 1 || config.type !== "dcb-char-ngram-tfidf" || config.max_chars !== 256
      || config.max_features !== 1270 || config.ngram_range?.join() !== "1,5"
      || !Array.isArray(config.vocabulary) || !Array.isArray(config.idf)
      || config.vocabulary.length !== config.idf.length || config.vocabulary.length > 120000
      || config.vocabulary.some(word => typeof word !== "string")
      || config.idf.some(value => !Number.isFinite(value) || value <= 0)) throw new Error("Invalid tokenizer contract");
    const vocabulary = new Map(config.vocabulary.map((word, index) => [word, index + 1]));
    if (vocabulary.size !== config.vocabulary.length) throw new Error("Duplicate tokenizer feature");
    const idf = Float32Array.from([0, ...config.idf]);
    function encode(text) {
      const characters = Array.from(text).slice(0, config.max_chars);
      const counts = new Map();
      for (let size = 1; size <= 5; size++) {
        for (let start = 0; start + size <= characters.length; start++) {
          const id = vocabulary.get(characters.slice(start, start + size).join(""));
          if (id) counts.set(id, (counts.get(id) || 0) + 1);
        }
      }
      const entries = [...counts].sort((a, b) => a[0] - b[0]);
      const inputIds = new BigInt64Array(Math.max(1, entries.length));
      const featureWeights = new Float32Array(inputIds.length);
      let squaredNorm = 0;
      entries.forEach(([id, count], index) => {
        inputIds[index] = BigInt(id);
        const value = Math.fround(Math.fround(Math.fround(Math.log(count)) + 1) * idf[id]);
        featureWeights[index] = value;
        squaredNorm += value * value;
      });
      const norm = Math.sqrt(squaredNorm) || 1;
      for (let index = 0; index < featureWeights.length; index++) featureWeights[index] /= norm;
      return { inputIds, featureWeights, dims: [1, inputIds.length] };
    }
    return Object.freeze({ encode });
  }
  globalThis.DCBDetectionTokenizer = Object.freeze({ create });
})();
