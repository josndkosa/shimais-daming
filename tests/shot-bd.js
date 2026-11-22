const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9315; const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new","--no-first-run","--disable-gpu",`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/ud52`,"--window-size=1280,1000","about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let ws,idc=0;const pending=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const id=++idc;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method:m,params:p}));});
const ev=async e=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
(async()=>{
  let t;for(let i=0;i<40;i++){await sleep(300);try{t=(await(await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x=>x.type==="page");if(t)break;}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(d.error.message)):p.res(d.result);}};
  await send("Page.enable");
  await send("Page.navigate",{url:"http://127.0.0.1:4173/timeline.html"});await sleep(1200);
  await ev(`document.querySelectorAll('.tm-state')[1].click()`);await sleep(300);
  await ev(`document.querySelector('.tl-era .tl-list').scrollIntoView({block:'start',behavior:'instant'})`);await sleep(400);
  const s=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(DIR+"/bd-list.png",Buffer.from(s.data,"base64"));
  ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error(e);chrome.kill();process.exit(2);});
