import {randomUUID} from 'node:crypto';

export const notificationChannels={telegram:'تلگرام',bale:'بله'};
const endpoints={telegram:'https://api.telegram.org/bot',bale:'https://tapi.bale.ai/bot'};
const fail=message=>Object.assign(Error(message),{status:400});
export function notificationMessage(order){
 const number=value=>new Intl.NumberFormat('fa-IR').format(value);
 return ['سفارش تازه در هویا',`کد سفارش: ${order.id}`,
  ...order.items.slice(0,10).map(item=>`${item.name} × ${number(item.qty)}`),
  `جمع کالاها: ${order.subtotalToman===null?'در انتظار تعیین قیمت':number(order.subtotalToman)+' تومان'}`,
  `وضعیت: ${order.status==='cancelled'?'لغو شده':order.payment?.status==='paid'?'وجه دریافت شده':'ثبت شده، پرداخت نشده'}`,
  `مشاهده و مدیریت: https://hooyamode.ir/admin/orders#order=${order.id}`].join('\n');
}
export async function sendBotMessage({channel,config,text,transport=fetch}){
 if(!Object.hasOwn(endpoints,channel))throw Error('Unknown notification channel');
 let response,data;
 try{
  response=await transport(endpoints[channel]+config.token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000),redirect:'error'});
  data=await response.json();
 }catch{throw Object.assign(Error('ارتباط با پیام رسان برقرار نشد؛ دوباره تلاش می‌شود.'),{retryable:true});}
 if(!response.ok||data?.ok!==true){
  const status=data?.error_code||response.status;
  throw Object.assign(Error(status===401?'توکن ربات معتبر نیست.':status===403?'دسترسی ربات به گفتگو برقرار نیست.':status===400?'شناسه گفتگو یا دسترسی ربات را بررسی کنید.':'ارسال به پیام رسان انجام نشد.'),{retryable:status===429||status>=500,retryAfter:Math.min(3600,Math.max(30,Number(data?.parameters?.retry_after)||0))});
 }
 return {messageId:String(data.result?.message_id||'')};
}
export function createNotifications({store,readConfig,writeConfig,send=sendBotMessage,now=Date.now}){
 let running=null,timer,editing=Promise.resolve();
 const active=config=>Object.keys(notificationChannels).filter(channel=>config[channel]?.enabled&&config[channel].token&&config[channel].chatId);
 async function channels(){try{return active(await readConfig());}catch{return [];}}
 async function status(){
  const config=await readConfig(),delivery=await store('notification_status');
  return {channels:Object.entries(notificationChannels).map(([channel,name])=>({channel,name,enabled:config[channel]?.enabled===true,configured:!!(config[channel]?.token&&config[channel]?.chatId),chatId:config[channel]?.chatId||'',...delivery[channel]}))};
 }
 async function saveConfiguration(input){
  if(!Object.hasOwn(notificationChannels,input.channel)||typeof input.enabled!=='boolean'||typeof input.token!=='string'||typeof input.chatId!=='string')throw fail('تنظیمات پیام رسان معتبر نیست.');
  const config=await readConfig(),current=config[input.channel]||{},token=input.token.trim()||current.token||'',chatId=input.chatId.trim();
  if(token&&!/^\d{4,20}:[A-Za-z0-9_-]{20,200}$/.test(token))throw fail('توکن ربات معتبر نیست.');
  if(chatId&&!/^-?[1-9]\d{0,19}$/.test(chatId))throw fail('شناسه عددی گفتگو را وارد کنید؛ شماره تلفن شناسه گفتگو نیست.');
  if(input.enabled&&(!token||!chatId))throw fail('ابتدا توکن ربات و شناسه گفتگو را وارد کنید.');
  config[input.channel]={enabled:input.enabled,token,chatId};await writeConfig(config);kick();return {ok:true};
 }
 function configure(input){const next=editing.then(()=>saveConfiguration(input));editing=next.catch(()=>{});return next;}
 async function retry(channel){
  const config=await readConfig();if(!active(config).includes(channel))throw fail('ابتدا اتصال این پیام رسان را فعال کنید.');
  const result=await store('notification_retry',{channel});kick();return result;
 }
 async function test(channel){
  const config=await readConfig();if(!Object.hasOwn(notificationChannels,channel)||!config[channel]?.token||!config[channel]?.chatId)throw fail('ابتدا تنظیمات ربات و گفتگو را ذخیره کنید.');
  await send({channel,config:config[channel],text:'پیام آزمایشی هویا؛ اتصال اعلان سفارش به '+notificationChannels[channel]+' برقرار است. این پیام سفارش نیست.'});return {ok:true};
 }
 async function drain(){
  const config=await readConfig(),enabled=active(config);if(!enabled.length)return;
  for(let i=0;i<20;i++){
   const lease=randomUUID(),job=await store('notification_claim',{channels:enabled,now:now(),lease});if(!job)return;
   try{
    const result=await send({channel:job.channel,config:config[job.channel],text:notificationMessage(job.order)});
    await store('notification_finish',{orderId:job.order.id,channel:job.channel,lease,deliveredAt:now(),messageId:result.messageId});
   }catch(error){
    const retry=error.retryable!==false&&job.attempts<12;
    await store('notification_finish',{orderId:job.order.id,channel:job.channel,lease,error:error.retryable===undefined?'ارسال اعلان انجام نشد.':error.message,failed:!retry,nextAt:now()+Math.max(error.retryAfter||0,Math.min(3600,30*2**Math.min(job.attempts-1,7)))*1000});
   }
  }
 }
 function kick(){if(!running)running=drain().catch(()=>{}).finally(()=>{running=null;});return running;}
 function start(){if(!timer){timer=setInterval(kick,15000);timer.unref?.();}kick();}
 function stop(){clearInterval(timer);timer=null;}
 return {channels,status,configure,test,retry,kick,start,stop};
}
