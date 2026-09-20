import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { UPGRADED_CASE_IDS, validateUpgradedCase } from "./phase5b-upgraded-cases.mjs";

function load(runRoot, file) { return createRequire(join(resolve(runRoot), "package.json"))(file); }
function equal(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} failed: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); }

export async function validateHeldoutCase(caseId, runRoot) {
  if (UPGRADED_CASE_IDS.has(caseId)) return validateUpgradedCase(caseId, runRoot);
  switch (caseId) {
    case "lp-01": { const { parseConfig }=load(runRoot,"./parser.js"); const cfg=parseConfig(await readFile(join(runRoot,"config.ini"),"utf8")); equal(cfg.db_host,"C:\\Users\\admin\\data","db_host"); equal(cfg.db_port,"5432","db_port"); return; }
    case "lp-02": { const { averageCompleted }=load(runRoot,"./summary.js"); equal(averageCompleted([{status:"complete",value:10},{status:"pending",value:null},{status:"complete",value:20},{status:"complete",value:30}]),20,"pending population"); equal(averageCompleted([{status:"pending",value:null}]),0,"empty completed"); return; }
    case "lp-03": { const fs=load(runRoot,"fs"), os=load(runRoot,"os"), path=load(runRoot,"path"); const { reproduceFailure }=load(runRoot,"./app.js"); const dir=fs.mkdtempSync(path.join(os.tmpdir(),"athena-lp03-")); const text=reproduceFailure(dir); if(!text||!text.includes("request failed")) throw new Error("diagnostic artifact missing"); return; }
    case "lp-04": { const dev=load(runRoot,"./src/index.js"), release=load(runRoot,"./release.js"); equal(dev.getVersion(),"2.0.0","dev version"); equal(release.getVersion(),"2.0.0","release version"); equal(release.getBuildChannel(),dev.getBuildChannel(),"channel"); return; }
    case "lp-05": { const repo=load(runRoot,"./repository.js"), cache=load(runRoot,"./cache.js"), svc=load(runRoot,"./service.js"); cache.clear(); equal(svc.readUpper("a"),"HELLO","first"); repo.update("a","world"); equal(svc.readUpper("a"),"WORLD","fresh update"); equal(svc.readUpper("a"),"WORLD","repeat"); return; }
    case "lp-06": { const { runLifecycle }=load(runRoot,"./pipeline.js"); equal(runLifecycle(),["validate","persist","notify"],"lifecycle order"); return; }
    case "lp-07": { const { Store }=load(runRoot,"./store.js"), { deliver }=load(runRoot,"./consumer.js"); const s=new Store(); const msg=JSON.stringify({id:"m-1",amount:10}); deliver(s,msg); deliver(s,msg); equal(s.balance,10,"idempotent retry"); return; }
    case "lp-08": { const { loadProfile }=load(runRoot,"./client.js"); equal(loadProfile(),{displayName:"Alice",email:"a@example.com",phone:"555-1234"},"profile adapter"); return; }
    case "lp-09": { const { localTime }=load(runRoot,"./formatter.js"); equal(localTime("2026-09-19T10:00:00Z","+05:30"),"15:30","half-hour offset"); equal(localTime("2026-09-19T10:00:00Z","-03:30"),"06:30","negative half-hour"); return; }
    case "lp-10": { const { resolveReading }=load(runRoot,"./resolver.js"); equal(resolveReading(7),7,"normal primary"); equal(resolveReading(0),0,"zero primary"); return; }
    case "lp-11": { const { startupSnapshot }=load(runRoot,"./startup.js"); equal(startupSnapshot(),"snapshot-10.json","numeric latest snapshot"); return; }
    case "lp-12": { const { request }=load(runRoot,"./app.js"); equal(request("/reports"),{handler:"reports-handler",allowed:true},"canonical"); equal(request("/reports/"),{handler:"reports-handler",allowed:true},"trailing slash"); return; }
    case "lp-13": { const {isWithinRange}=load(runRoot,"./validator.js"); equal(isWithinRange(5,1,10),true,"interior"); equal(isWithinRange(10,1,10),true,"upper"); equal(isWithinRange(0,1,10),false,"below"); return; }
    case "lp-14": { const {validate}=load(runRoot,"./schema.js"); equal(validate({name:"A",age:30,email:"a@b.com"}).valid,true,"complete"); equal(validate({name:"B",age:20}).valid,false,"email required"); return; }
    case "lp-15": { const {calculateTotal}=load(runRoot,"./utils.js"); if(typeof calculateTotal!=="function") throw new Error("calculateTotal missing"); equal(calculateTotal([{price:10,qty:2},{price:5,qty:3}]),35,"total"); return; }
    case "lp-16": { const {compute}=load(runRoot,"./math.js"); equal(compute(6,3),6,"compute"); equal(compute(8,2),8,"compute second"); return; }
    case "lp-17": { const {getSecondElement,getLastElement}=load(runRoot,"./fetcher.js"); equal(getSecondElement([10,20,30]),20,"second"); equal(getLastElement([10,20,30]),30,"last"); equal(getLastElement([]),null,"empty"); return; }
    case "lp-18": { const {getField}=load(runRoot,"./parser.js"); equal(getField(null,"a"),null,"null"); equal(getField('{"a":1}',"a"),1,"field"); return; }
    case "lp-19": { const {encode,decode}=load(runRoot,"./codec.js"); equal(decode(encode("Hello, World!")),"Hello, World!","roundtrip"); return; }
    case "lp-20": { const {customSort}=load(runRoot,"./sorter.js"); equal(customSort([3,1,4,1,5,9,2,6]),[1,1,2,3,4,5,6,9],"sort"); return; }
    case "lp-21": { const {validatePassword}=load(runRoot,"./password.js"); equal(validatePassword("abcdefgh").valid,true,"min"); equal(validatePassword("123456789012").valid,true,"max"); equal(validatePassword("1234567890123").valid,false,"too long"); return; }
    case "lp-22": { const {parseCSV}=load(runRoot,"./csv.js"); equal(parseCSV("apple,banana,cherry"),["apple","banana","cherry"],"csv"); return; }
    case "lp-23": { const {readFileSafe}=load(runRoot,"./reader.js"); const r=readFileSafe("/nonexistent/phase5b-file.txt"); if(r.data!==null||!r.error) throw new Error("missing-file handling"); return; }
    case "lp-24": { const {validateEmail}=load(runRoot,"./email.js"); equal(validateEmail("user@example.com"),true,"simple"); equal(validateEmail("User.Name+tag@domain.co.uk"),true,"complex"); equal(validateEmail("invalid"),false,"invalid"); return; }
    case "lp-25": { const {createServer}=load(runRoot,"./server.js"); const s=createServer(()=>({status:"ok"})); equal(s.handle({headers:{"content-type":"text/plain"}}),{status:"ok"},"valid request"); if(!s.handle({headers:{}}).error) throw new Error("invalid request"); return; }
    case "lp-26": { const {processUser}=load(runRoot,"./api.js"); equal(processUser({firstName:"Alice",lastName:"Smith",age:"30"}),{name:"Alice Smith",age:30,valid:true},"profile"); return; }
    case "lp-27": { const {Cache}=load(runRoot,"./cache.js"), {hitRate}=load(runRoot,"./metrics.js"); const c=new Cache(); c.set("a",1); c.set("b",2); c.get("a"); c.get("x"); equal(hitRate(c.stats()),0.5,"hit rate"); equal(hitRate({hits:0,misses:0,entries:0}),0,"empty rate"); return; }
    case "lp-28": { const {processRecords}=load(runRoot,"./pipeline.js"); const r=processRecords([{id:1,name:"a"},{id:2,name:"b"},{id:1,name:"c"},{id:3,name:"d"}]); equal(r.length,3,"count"); equal(r.find(x=>x.id===1)?.name,"c","latest duplicate"); return; }
    case "lp-29": { const {getUser}=load(runRoot,"./api.js"); equal(getUser(1),{name:"Alice",userId:1},"response contract"); equal(getUser(99),null,"missing user"); return; }
    case "lp-30": { const {getConfig}=load(runRoot,"./config.js"); equal(getConfig("database.host"),"localhost","host"); equal(getConfig("server.port"),3000,"port"); equal(getConfig("nonexistent.path"),undefined,"missing nested"); return; }
    default: throw new Error(`Unknown held-out case: ${caseId}`);
  }
}

const [caseId,runRoot]=process.argv.slice(2);
if (import.meta.url === new URL(process.argv[1],"file:").href) {
  if(!caseId||!runRoot){process.stderr.write("usage: validate-case.mjs <case-id> <run-root>\n"); process.exitCode=2;}
  else { try { await validateHeldoutCase(caseId,runRoot); } catch(error){ process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode=1; } }
}
