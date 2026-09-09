export async function applyAppUpdate(container: ServiceWorkerContainer, reload: () => void, onProgress: (message: string) => void, timeoutMs = 10000) {
  onProgress("更新内容を確認しています…");
  const timed = async <T>(promise: Promise<T>, message: string) => {
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs);})]);}
    finally{clearTimeout(timer);}
  };
  const registration = await timed(container.getRegistration(),"PWA_UPDATE_LOOKUP_TIMEOUT：更新情報を取得できませんでした。");
  if (!registration) { reload(); return; }
  if (!registration.waiting) await timed(registration.update(),"PWA_UPDATE_CHECK_FAILED：更新の確認が完了しませんでした。通信を確認してください。");
  const installing = registration.installing;
  if (installing && !registration.waiting) {
    onProgress("更新ファイルを準備しています…");
    await new Promise<void>((resolve,reject)=>{
      const done=(error?:Error)=>{clearTimeout(timer);installing.removeEventListener("statechange",check);if(error)reject(error);else resolve();};
      const check=()=>{if(["installed","activating","activated"].includes(installing.state))done();else if(installing.state==="redundant")done(new Error("PWA_UPDATE_INSTALL_FAILED：更新ファイルを準備できませんでした。再試行してください。"));};
      const timer=setTimeout(()=>done(new Error("PWA_UPDATE_INSTALL_TIMEOUT：更新ファイルの準備が完了しませんでした。再試行してください。")),timeoutMs);
      installing.addEventListener("statechange",check);check();
    });
  }
  const worker = registration.waiting ?? (installing?.state === "installed" ? installing : null);
  if (!worker) { reload(); return; }
  onProgress("新しいアプリへ切り替えています…");
  await new Promise<void>((resolve, reject) => {
    let complete = false;
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true; clearTimeout(timer);
      container.removeEventListener("controllerchange", changed);worker.removeEventListener("statechange", stateChanged);
      if (error) reject(error); else { try{reload();resolve();}catch(error){reject(error);} }
    };
    const changed = () => finish();
    const stateChanged = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("PWA_UPDATE_REPLACED：更新情報が切り替わりました。もう一度更新してください。"));
    };
    const timer = setTimeout(() => {
      if (worker.state === "activated" || registration.active === worker) finish();
      else finish(new Error("PWA_UPDATE_TIMEOUT：切替を確認できませんでした。「画面を読み直す」で再読み込みできます。"));
    }, timeoutMs);
    container.addEventListener("controllerchange", changed);worker.addEventListener("statechange", stateChanged);
    try { worker.postMessage({ type: "SKIP_WAITING" }); stateChanged(); }
    catch { finish(new Error("PWA_UPDATE_SEND_FAILED：更新を開始できませんでした。画面を読み直してください。")); }
  });
}
