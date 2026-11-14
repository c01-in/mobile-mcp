// Real HTTP MCP checks. Never sends an SMS or uninstalls a personal application.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const url = process.env.CHECK_URL || 'http://127.0.0.1:18793/mcp';
const token = process.env.MOBILEMCP_AUTH || fs.readFileSync(process.env.CHECK_TOKEN_FILE || 'E:/Dev/Secrets/mobile-mcp/backend.env','utf8').trim().split('=')[1];
let id=0;
async function rpc(method,params={}) {
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
 const raw=await response.text();
 assert.equal(response.status,200,raw);
 const result=raw.startsWith('event:')||raw.startsWith('data:') ? JSON.parse(raw.split('\n').find(x=>x.startsWith('data:')).slice(5)) : JSON.parse(raw);
 assert(!result.error,JSON.stringify(result.error)); return result.result;
}
async function call(name,args={}) { const r=await rpc('tools/call',{name,arguments:args}); assert(!r.isError,JSON.stringify(r)); return r; }
function text(result) { return result.content.find(x=>x.type==='text').text; }
const adb=(...args)=>execFileSync(process.env.CHECK_ADB || 'E:/Dev/Android/Sdk/platform-tools/adb.exe',['-s',process.env.CHECK_DEVICE||'cfdd5181',...args],{env:process.env,encoding:'utf8',timeout:30000});
(async()=>{
 const unauth=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); assert.equal(unauth.status,401); console.log('PASS unauthenticated HTTP rejected');
 await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'transages-local-check',version:'1.0'}});
 const list=await rpc('tools/list'); console.log('PASS MCP initialize and tools/list: '+list.tools.length+' tools');
 const devices=JSON.parse(text(await call('mobile_list_available_devices'))); assert(devices.length); const device=devices[0].deviceId;
 await call('mobile_wake_unlock',{device}); console.log('PASS USB discovery, wake and dismiss keyguard');
 if(process.env.CHECK_INSTALL==='1') {
  await call('mobile_install_app',{device,source:process.env.CHECK_APK || 'E:/Dev/Projects/mobile-mcp/android-bridge/dist/mobile-bridge.apk'});
  for(const p of ['READ_SMS','SEND_SMS']) adb('shell','pm','grant','--user','0','com.transages.mobilebridge','android.permission.'+p);
  console.log('PASS bridge APK install through MCP for user 0 and runtime grants');
 }
 const screenshot=await call('mobile_take_screenshot',{device}); assert(screenshot.content[0].data.length>1000); console.log('PASS screenshot '+Buffer.from(screenshot.content[0].data,'base64').length+' bytes');
 await call('mobile_get_screen_size',{device});
 await call('mobile_list_apps',{device});
 await call('mobile_launch_app',{device,packageName:'com.android.settings'});
 await call('mobile_press_button',{device,button:'BACK'});
 console.log('PASS list/launch apps and back');
 if(process.env.CHECK_INPUT==='1') {
  adb('shell','am','start','--user','0','-n','com.transages.mobilebridge/.InputCheckActivity');
  await new Promise(r=>setTimeout(r,500));
  await call('mobile_click_on_screen_at_coordinates',{device,x:180,y:180});
  await call('mobile_swipe_on_screen',{device,direction:'up'});
  const before=adb('shell','settings','--user','0','get','secure','default_input_method').trim();
  const sample='中文输入 MCP 123 & test';
  await call('mobile_type_keys',{device,text:sample});
  const out=adb('shell','am','broadcast','--user','0','--include-stopped-packages','-n','com.transages.mobilebridge/.BridgeReceiver','-a','com.transages.mobilebridge.check_input','--es','payload',Buffer.from('{}').toString('base64'));
  assert.equal(JSON.parse(Buffer.from(out.match(/data="([A-Za-z0-9+/=]+)"/)[1],'base64')).text,sample);
  assert.equal(adb('shell','settings','--user','0','get','secure','default_input_method').trim(),before);
  await call('mobile_press_button',{device,button:'BACK'});
  console.log('PASS actual Unicode text committed and previous keyboard restored');
 }
 // Query an empty future range to validate permission without printing private SMS content.
 const sms=JSON.parse(text(await call('mobile_read_sms',{device,limit:1,since:Date.now()+86400000}))); assert(Array.isArray(sms.messages));
 console.log('PASS SMS provider permission; no real SMS sent');
 if(process.env.CHECK_LIFECYCLE==='1') {
  await call('mobile_uninstall_app',{device,packageName:'com.transages.mobilebridge'});
  assert(!text(await call('mobile_list_apps',{device})).includes('com.transages.mobilebridge'));
  await call('mobile_install_app',{device,source:process.env.CHECK_APK});
  for(const p of ['READ_SMS','SEND_SMS']) adb('shell','pm','grant','--user','0','com.transages.mobilebridge','android.permission.'+p);
  console.log('PASS uninstall verified absent, reinstall bridge and restore permissions');
 }
 console.log('COMPLETE');
})().catch(e=>{console.error(e);process.exitCode=1});
