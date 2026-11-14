// Internal operator helper. Reads the container's private token from its env.
const request=JSON.parse(process.argv[2]);
fetch('http://127.0.0.1:18793/mcp',{
 method:'POST',headers:{Authorization:`Bearer ${process.env.MOBILEMCP_AUTH}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:request})
}).then(async r=>{
 const raw=await r.text();
 const msg=raw.startsWith('event:')||raw.startsWith('data:') ? JSON.parse(raw.split('\n').find(x=>x.startsWith('data:')).slice(5)) : JSON.parse(raw);
 console.log(JSON.stringify(msg));
 if(!r.ok||msg.error||msg.result?.isError)process.exitCode=1;
}).catch(e=>{console.error(e.message);process.exitCode=1});
