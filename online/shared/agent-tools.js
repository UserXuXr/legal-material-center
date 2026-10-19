import {batchInputSchema,capabilities,templateExample,validateRequest} from './adapters.js';
export function registerAgentTools(context,actions,onError=()=>{}) {
  if(!context?.registerTool)return {available:false,dispose:()=>{}};
  const controller=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
  const batchId={type:'object',properties:{batch_id:{type:'string'}},required:['batch_id'],additionalProperties:false};
  const define=(name,title,inputSchema,execute,readOnly=false)=>({name,title,description:title+'。使用当前工作台的真实输入、制件结果或已保存文件；不代表Forge已回收或批准。',inputSchema,execute,annotations:{readOnlyHint:readOnly,untrustedContentHint:true}});
  const tools=[
    define('get_capabilities','读取实际制件能力',empty,()=>capabilities(),true),
    define('get_template','读取模板与完整示例',{type:'object',properties:{engine:{type:'string',enum:['finance','rights','contracts','certificates','business']},template_id:{type:'string'}},required:['engine'],additionalProperties:false},input=>templateExample(input.engine,input.template_id),true),
    define('validate_batch','检查批次输入',batchInputSchema,async input=>({issues:await validateRequest(input)}),true),
    define('stage_batch','保存批次草稿',batchInputSchema,actions.stage),
    define('render_batch','逐份制作并保存文件',batchId,input=>actions.run(input.batch_id)),
    define('get_job_status','读取文档状态与文件哈希',{...batchId,properties:{...batchId.properties,include_input:{type:'boolean',description:'true时读回已保存的完整payload，供生成前核对冻结事实'}}},input=>actions.status(input.batch_id,!!input.include_input),true),
    define('retry_documents','重试指定失败文档',{type:'object',properties:{batch_id:{type:'string'},document_ids:{type:'array',items:{type:'string'},minItems:1,uniqueItems:true}},required:['batch_id','document_ids'],additionalProperties:false},input=>actions.retry(input.batch_id,input.document_ids)),
    define('export_package','下载业务材料或制作记录',{type:'object',properties:{batch_id:{type:'string'},profile:{type:'string',enum:['candidate','authoring']},allow_partial:{type:'boolean'}},required:['batch_id','profile'],additionalProperties:false},input=>actions.export(input.batch_id,input.profile,!!input.allow_partial)),
  ];
  Promise.all(tools.map(tool=>Promise.resolve().then(()=>context.registerTool(tool,{signal:controller.signal})))).catch(error=>{controller.abort();onError(error);});
  return {available:true,dispose:()=>controller.abort(),tools};
}
