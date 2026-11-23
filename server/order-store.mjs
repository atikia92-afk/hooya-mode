import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function createOrderStore(database,{python=process.env.HOOYA_PYTHON||'python3'}={}){
 return async(op,data={})=>new Promise((resolve,reject)=>{
  const child=spawn(python,['-X','utf8',fileURLToPath(new URL('./order-store.py',import.meta.url)),database],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let output='',failed=false;const timer=setTimeout(()=>{failed=true;child.kill();reject(Error('Order storage timeout'));},8000);
  child.stdout.on('data',part=>{output+=part;if(Buffer.byteLength(output)>2_000_000){failed=true;child.kill();reject(Error('Order response too large'));}});
  // SQLite exception text may contain private values. Never forward stderr to logs.
  child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('Order storage unavailable'));});
  child.on('close',code=>{clearTimeout(timer);if(failed)return;if(code!==0){reject(Error('Order storage unavailable'));return;}try{resolve(JSON.parse(output));}catch{reject(Error('Invalid storage response'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({op,...data}));
 });
}
