const assert=require('node:assert/strict');
const cp=require('node:child_process');
const commands=[];
cp.execFileSync=(_exe,args)=>{
 commands.push(args);
 if(args.includes('users')) return Buffer.from('Users:\n UserInfo{0:Owner:13} running');
 if(args.includes('get-current-user')) return Buffer.from('0\n');
 return Buffer.from('Success\n');
};
const {AndroidRobot}=require('../lib/android');
(async()=>{
 const r=new AndroidRobot('test-device');
 await r.installApp('example.apk');
 await r.uninstallApp('com.example.app');
 await r.launchApp('com.example.app');
 await r.terminateApp('com.example.app');
 await r.openUrl('https://example.com');
 await r.setOrientation('portrait');
 for(const c of commands.filter(c=>!c.includes('users'))) {
  assert(c.includes('--user') && c[c.indexOf('--user')+1]==='0',JSON.stringify(c));
 }
 assert(commands.findIndex(c=>c.includes('users'))<commands.findIndex(c=>c.includes('install')));
 await assert.rejects(()=>r.uninstallApp('com.example;reboot'));
 console.log('PASS install, uninstall, launch, stop, URL, orientation routed to owner 0; owner enumeration precedes install; shell package injection rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
