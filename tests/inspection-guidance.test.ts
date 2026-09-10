import {expect,it} from "vitest";
import {inspectionGuidance} from "../src/lib/inspection-guidance";
it("keeps device recovery executable inline and explains what server checks cannot prove",()=>{
  expect(inspectionGuidance("CHECK_DEVICE_NOTIFICATION").kind).toBe("notifications");
  expect(inspectionGuidance("CHECK_APP_UPDATE").kind).toBe("update");
  expect(inspectionGuidance("CHECK_DEVICE_NOTIFICATION").steps.join()).toContain("端末の通知欄");
});
it("does not mistake parallel stocktakes or an empty new system for damaged data",()=>{
  expect(inspectionGuidance("CHECK_ACTIVE_STOCKTAKE").meaning).toContain("正常");
  expect(inspectionGuidance("CHECK_MASTER_DATA").meaning).toContain("故障ではありません");
});
it("does not invent a repair for unsupported checks",()=>{
  expect(inspectionGuidance("UNKNOWN").meaning).toContain("処置が登録されていません");
  expect(inspectionGuidance("CHECK_DATABASE_CONNECTION").steps.join()).toContain("強制修復できません");
});
