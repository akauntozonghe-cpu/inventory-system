import {describe,expect,it} from "vitest";
import {extractErrorCode,getErrorGuidance} from "../src/lib/error-guidance";

describe("administrator self-service recovery for classification cleanup",()=>{
  it("recognizes the actual classification conflict code shown in the toast",()=>{
    const displayed="17件の商品が使用中です。削除ではなく統合または移動を実行してください。（CLASSIFICATION_IN_USE）";
    const code=extractErrorCode(displayed);
    expect(code).toBe("CLASSIFICATION_IN_USE");
    const guide=getErrorGuidance(code);
    expect(guide.recoveryRoute).toBe("/admin/classifications");
    expect(guide.action).toContain("使用状況");
    expect(guide.action).toContain("商品名");
    expect(guide.action).not.toContain("管理者に");
  });
  it("provides next steps for conflicting cleanup and historical location use",()=>{
    for(const code of ["CLASSIFICATION_UNASSIGN_BLOCKED","LOCATION_IN_USE","LOCATION_HISTORICAL_REQUESTS"]){
      const guide=getErrorGuidance(code);
      expect(guide.recoveryRoute).toBe("/admin/classifications");
      expect(guide.adminSteps.length).toBeGreaterThanOrEqual(3);
      expect(guide.action).not.toContain("管理者に伝えて");
    }
  });
  it("does not direct an administrator to contact themselves for unknown errors",()=>{
    const guide=getErrorGuidance("UNEXPECTED_SAVE_ERROR");
    expect(guide.action).not.toContain("管理者にこのエラーコード");
    expect(guide.action).toContain("再読み込み");
  });
});
