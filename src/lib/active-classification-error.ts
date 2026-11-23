/** A missing/retired category is a user-correctable conflict, never a 500 or silent creation. */
export function activeClassificationError(error:unknown):{code:string;message:string;status:409}|null{
  const code=error instanceof Error?error.message:"";
  if(code==="CLASSIFICATION_PARENT_REQUIRED")return {code,message:"小分類を選ぶ前に、有効な大分類を選択してください。",status:409};
  if(code==="CLASSIFICATION_TARGET_NOT_ACTIVE")return {code,message:"分類が未登録または廃止済みです。分類管理で有効な分類を選択してください。新しい分類は管理者が登録します。",status:409};
  return null;
}
