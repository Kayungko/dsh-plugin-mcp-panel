import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function panel(reply) {
  let registration, component;
  const effects=[],states=[],calls=[],timers=[],cleared=[];
  const react={createElement:(type,props,...children)=>({type,props,children}),
    useState:()=>[null,value=>states.push(value)],useEffect:fn=>effects.push(fn)};
  vm.runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'),{
    window:{__ModuleLoader__:{load:value=>{registration=value;}}},
    document:{querySelector:()=>({})},
    setTimeout:fn=>{timers.push(fn);return 123;},clearTimeout:id=>cleared.push(id),
  });
  const module=registration.factory(()=>react);
  module.apply({get:name=>{
    if(name==='remote')throw new Error('third-party namespace is not generated');
    return name==='connection'?{rpc:{call:async(...args)=>{calls.push(args);return reply;}}}:undefined;
  },
    slots:{inject:(_name,fn)=>fn(),register:(_options,view)=>{component=view;return()=>{};}}});
  component();
  return {effects,states,calls,timers,cleared};
}

test('0.2 MCP page uses generic Connection RPC for its third-party namespace',async()=>{
  const ui=panel({ok:true,value:{servers:[],total:0,generatedAt:'fixture'}});
  const dispose=ui.effects[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(ui.calls[0]),JSON.stringify(['/api','mcpPanel/snapshot',{args:{}}]));
  assert.equal(ui.states[0].value.generatedAt,'fixture');assert.equal(ui.timers.length,1);
  dispose();assert.deepEqual(ui.cleared,[123]);
});

test('0.2 MCP page contains failed RPC responses and retains a retry',async()=>{
  const ui=panel({ok:false,error:{message:'fixture failure'}});
  const dispose=ui.effects[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.states[0].error,/fixture failure/);assert.equal(ui.timers.length,1);dispose();
});
