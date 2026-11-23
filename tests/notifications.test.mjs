import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createOrderStore} from '../server/order-store.mjs';
import {createNotifications,notificationMessage,sendBotMessage} from '../server/notifications.mjs';
const enabled=process.platform!=='win32'||!!process.env.HOOYA_TEST_PYTHON;
const config={telegram:{enabled:true,token:'12345:abcdefghijklmnopqrstuvwxyz',chatId:'12345'},bale:{enabled:true,token:'54321:zyxwvutsrqponmlkjihgfedcba',chatId:'54321'}};
const sample=()=>({id:randomUUID(),billing:{phone:'09120000000',address:'Private address',firstName:'Private name'},shipping:{address:'Private shipping'},notes:'Private note',requestKey:randomUUID(),privateNote:'Internal note',createdAt:new Date().toISOString(),items:[{name:'وست آزمایشی',qty:1}],subtotalToman:100000});
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hooya-notifications-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=createOrderStore(path.join(directory,'orders.sqlite3'),{python:process.env.HOOYA_TEST_PYTHON||'python3'});return store;}
test('notification messages contain an admin link and no customer contact, receipt secret or private notes',()=>{
 const order=sample(),text=notificationMessage(order);assert.ok(text.includes(order.id));assert.ok(text.includes('/admin/orders#order='));for(const value of ['09120000000','Private','Internal',order.requestKey])assert.ok(!text.includes(value));
});
test('both adapters use the official HTTPS API, validate success, and redact provider errors',async()=>{
 for(const channel of ['telegram','bale']){
  let called;const sent=await sendBotMessage({channel,config:config[channel],text:'Test',transport:async(url,options)=>{called={url,options};return{ok:true,json:async()=>({ok:true,result:{message_id:42}})};}});
  assert.equal(sent.messageId,'42');assert.equal(called.url,(channel==='telegram'?'https://api.telegram.org/bot':'https://tapi.bale.ai/bot')+config[channel].token+'/sendMessage');assert.equal(called.options.redirect,'error');assert.equal(JSON.parse(called.options.body).chat_id,config[channel].chatId);
  await assert.rejects(sendBotMessage({channel,config:config[channel],text:'Test',transport:async()=>({ok:false,status:401,json:async()=>({ok:false,description:config[channel].token})})}),error=>!error.message.includes(config[channel].token)&&error.retryable===false);
 }
});
test('atomic order retries enqueue one alert per enabled channel; successful deliveries survive restart',{skip:!enabled},async t=>{
 const store=await setup(t),order=sample(),input={key:order.requestKey,hash:'test',order,channels:['telegram','bale']};
 await Promise.all([store('create',input),store('create',input)]);let sent=[];
 const notifications=createNotifications({store,readConfig:async()=>config,writeConfig:async()=>{},send:async message=>{sent.push(message.channel);return{messageId:'42'};}});
 await Promise.all([notifications.kick(),notifications.kick()]);assert.deepEqual(sent.sort(),['bale','telegram']);
 const restarted=createNotifications({store,readConfig:async()=>config,writeConfig:async()=>{},send:async()=>assert.fail('Already delivered')});await restarted.kick();
 const status=await restarted.status();assert.equal(status.channels[0].counts.delivered,1);assert.equal(status.channels[1].counts.delivered,1);assert.ok(!JSON.stringify(status).includes(config.telegram.token));
});
test('a temporary failure is retried after restart; another channel and the saved order remain available',{skip:!enabled},async t=>{
 const store=await setup(t),order=sample();let clock=Date.now();await store('create',{key:order.requestKey,hash:'test',order,channels:['telegram','bale']});
 const first=createNotifications({store,readConfig:async()=>config,writeConfig:async()=>{},now:()=>clock,send:async({channel})=>{if(channel==='telegram')throw Object.assign(Error('network'),{retryable:true});return{messageId:'1'};}});await first.kick();
 assert.ok(await store('get',{id:order.id}));let status=await first.status();assert.equal(status.channels[0].counts.pending,1);assert.equal(status.channels[1].counts.delivered,1);
 clock+=31000;let deliveries=0;const second=createNotifications({store,readConfig:async()=>config,writeConfig:async()=>{},now:()=>clock,send:async({channel})=>{assert.equal(channel,'telegram');deliveries++;return{messageId:'2'};}});await second.kick();assert.equal(deliveries,1);status=await second.status();assert.equal(status.channels[0].counts.delivered,1);
});
test('unconfigured channels stay disabled; secrets are preserved on edits and never returned',{skip:!enabled},async t=>{
 const store=await setup(t);let saved={};const notifications=createNotifications({store,readConfig:async()=>saved,writeConfig:async value=>saved=value,send:async()=>assert.fail('Must not send')});
 assert.deepEqual(await notifications.channels(),[]);await assert.rejects(notifications.configure({channel:'telegram',enabled:true,token:'',chatId:''}),/توکن/);
 await notifications.configure({channel:'telegram',enabled:false,token:config.telegram.token,chatId:'12345'});
 await notifications.configure({channel:'telegram',enabled:false,token:'',chatId:'12345'});assert.equal(saved.telegram.token,config.telegram.token);assert.ok(!JSON.stringify(await notifications.status()).includes(config.telegram.token));
 await assert.rejects(notifications.configure({channel:'unknown',enabled:false,token:'',chatId:''}));
});
test('the administrator can retry a repaired connection without resending delivered notifications',{skip:!enabled},async t=>{
 const store=await setup(t),order=sample();await store('create',{key:order.requestKey,hash:'test',order,channels:['telegram','bale']});let rejectTelegram=true,delivered=[];
 const notifications=createNotifications({store,readConfig:async()=>config,writeConfig:async()=>{},send:async({channel})=>{if(channel==='telegram'&&rejectTelegram)throw Object.assign(Error('Invalid token'),{retryable:false});delivered.push(channel);return{messageId:'42'};}});
 await notifications.kick();assert.equal((await notifications.status()).channels[0].counts.failed,1);rejectTelegram=false;
 assert.equal((await notifications.retry('telegram')).retried,1);await notifications.kick();assert.deepEqual(delivered,['bale','telegram']);assert.equal((await notifications.status()).channels[0].counts.delivered,1);
});
