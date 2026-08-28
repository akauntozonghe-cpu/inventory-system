type DuplicateInput = {
  name?: string | null;
  janCode?: string | null;
  managementCode?: string | null;
  manufacturer?: string | null;
  lotNo?: string | null;
  storageLocationId?: string | null;
};

function text(value?: string | null) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

function code(value?: string | null) {
  return text(value).replace(/[\s-]/g, "");
}

export function duplicateScore(input: DuplicateInput, candidate: DuplicateInput) {
  const reasons: string[] = [];
  let score = 0;

  if (code(input.janCode) && code(input.janCode) === code(candidate.janCode)) {
    score += 100;
    reasons.push("JAN一致");
  }
  if (
    code(input.managementCode) &&
    code(input.managementCode) === code(candidate.managementCode)
  ) {
    score += 90;
    reasons.push("管理コード一致");
  }
  if (text(input.name) && text(input.name) === text(candidate.name)) {
    score += 55;
    reasons.push("商品名一致");
  }
  if (
    text(input.manufacturer) &&
    text(input.manufacturer) === text(candidate.manufacturer)
  ) {
    score += 15;
    reasons.push("メーカー一致");
  }
  if (text(input.lotNo) && text(input.lotNo) === text(candidate.lotNo)) {
    score += 25;
    reasons.push("ロット一致");
  }
  if (
    input.storageLocationId &&
    input.storageLocationId === candidate.storageLocationId
  ) {
    score += 10;
    reasons.push("保管場所一致");
  }

  return {
    score: Math.min(score, 100),
    reasons,
    likelyDuplicate: score >= 55,
  };
}
