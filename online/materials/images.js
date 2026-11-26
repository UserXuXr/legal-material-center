import {text} from './documents.js';
import {escapeXML,wrapText,svgText,svgPage} from './pages.js';
import {wordBytes} from '../shared/word.js';
export const IMAGE_SCHEMA='legal-image/1';
const kinds=['chat','webpage','attendance','diagram'];
const list=(a,label,max)=>{if(!Array.isArray(a)||!a.length||a.length>max)throw Error(`${label}需包含1至${max}项`);return a;};
const exact=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))throw Error('图片材料含不支持字段');};
export function cleanImage(input){
  exact(input,['schema_version','id','kind','title','data']);
  if(input.schema_version!==IMAGE_SCHEMA||!kinds.includes(input.kind))throw Error('图片类型或版本无效');
  const d={schema_version:IMAGE_SCHEMA,id:text(input.id,'文档编号',100),kind:input.kind,title:text(input.title,'标题',100),data:{}};
  if(!d.id||!d.title.trim())throw Error('请填写文档编号和标题');
  const v=input.data;
  if(d.kind==='chat'){
    exact(v,['left','right','messages']);d.data={left:text(v.left,'左侧参与人',40),right:text(v.right,'右侧参与人',40),messages:list(v.messages,'聊天记录',100).map(m=>{
      exact(m,['side','time','body']);if(!['left','right'].includes(m.side))throw Error('聊天方向须为left或right');
      return {side:m.side,time:text(m.time,'聊天时间',100),body:text(m.body,'消息正文',8000)};
    })};
  }else if(d.kind==='webpage'){
    exact(v,['url','capturedAt','seller','disclosure','products']);
    d.data={url:text(v.url,'页面地址',500),capturedAt:text(v.capturedAt,'记载时间',100),seller:text(v.seller,'页面主体',100),disclosure:text(v.disclosure,'公示与其他信息',8000),products:list(v.products,'页面条目',30).map(p=>{
      exact(p,['name','price','description']);return {name:text(p.name,'条目名称',150),price:text(p.price,'价格记载',100),description:text(p.description,'条目内容',3000)};
    })};
  }else if(d.kind==='attendance'){
    exact(v,['system','person','events']);d.data={system:text(v.system,'系统名称',80),person:text(v.person,'人员名称',40),events:list(v.events,'打卡记录',60).map(e=>{
      exact(e,['date','time','action','place','status']);return Object.fromEntries(['date','time','action','place','status'].map(k=>[k,text(e[k],k,120)]));
    })};
  }else{
    exact(v,['nodes','edges','note']);
    const ids=new Set();const nodes=list(v.nodes,'图示节点',12).map(n=>{
      exact(n,['id','label']);if(!/^[A-Za-z0-9_-]{1,30}$/.test(n.id)||ids.has(n.id))throw Error('节点编号无效或重复');ids.add(n.id);return {id:n.id,label:text(n.label,'节点文字',80)};
    });
    if(!Array.isArray(v.edges)||v.edges.length>30)throw Error('图示连线最多30条');
    const edges=v.edges.map(e=>{exact(e,['from','to','label']);if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)throw Error('连线需引用两个不同的已有节点');return {from:e.from,to:e.to,label:text(e.label??'','连线文字',30)};});
    d.data={nodes,edges,note:text(v.note??'','图示说明',1200)};
  }
  return d;
}
export function exampleImage(kind='chat'){
  const common={schema_version:IMAGE_SCHEMA,id:'example-image-'+kind,kind};
  const examples={
    chat:{title:'项目交接聊天记录',data:{left:'林岑（合成）',right:'周沐（合成）',messages:[{side:'left',time:'2026-09-18 09:00',body:'请确认本周交接清单的版本，附件是否齐全？'},{side:'right',time:'2026-09-18 09:05',body:'目前收到v2讨论稿，附件二尚未收到。签署页仍为空白。'},{side:'left',time:'2026-09-18 09:08',body:'先记录收到的文件和时间，其他事项待补充资料后核对。'}]}},
    webpage:{title:'清岑示例商城页面',data:{url:'https://example.invalid/store/demo',capturedAt:'2026-09-18 10:00 +08:00',seller:'清岑示例商店（合成）',disclosure:'本页面为合成示例。商品介绍、价格及页面主体分别记载，不代表实际商品、许可或经营状态。',products:[{name:'示例产品A',price:'¥ 180.00',description:'标准版，展示名称及售价记载。'},{name:'示例产品B',price:'¥ 260.00',description:'附配件包，具体说明见页面原文。'}]}},
    attendance:{title:'林岑打卡记录',data:{system:'示例考勤',person:'林岑（合成）',events:[{date:'2026-09-18',time:'09:00',action:'上班打卡',place:'示例市甲办公点',status:'打卡成功'},{date:'2026-09-18',time:'18:00',action:'下班打卡',place:'示例市甲办公点',status:'打卡成功'}]}},
    diagram:{title:'示例流程与排水路径',data:{nodes:[{id:'A',label:'甲工序'},{id:'B',label:'中间储罐'},{id:'C',label:'处理设施'},{id:'D',label:'采样点甲'},{id:'E',label:'示例排口'}],edges:[{from:'A',to:'B',label:'输送'},{from:'B',to:'C',label:'进入处理'},{from:'C',to:'D',label:'采样路径'},{from:'D',to:'E',label:'排放路径'}],note:'合成示意图。节点与连线仅按输入关系展示；不代表实际测绘比例、管线方向或检测结论。'}},
  };
  if(!examples[kind])throw Error('未找到图片模板');return {...common,...structuredClone(examples[kind])};
}
export function imageTranscript(input){
  const d=cleanImage(input),v=d.data;
  if(d.kind==='chat')return v.messages.map((m,i)=>`${i+1}. ${m.time}　${v[m.side]}\n${m.body}`).join('\n\n');
  if(d.kind==='webpage')return `页面地址：${v.url}\n记载时间：${v.capturedAt}\n页面主体：${v.seller}\n\n${v.products.map(p=>`${p.name}\n价格记载：${p.price}\n${p.description}`).join('\n\n')}\n\n公示与其他信息：${v.disclosure}`;
  if(d.kind==='attendance')return `系统：${v.system}\n人员：${v.person}\n\n${v.events.map(e=>`${e.date} ${e.time} ${e.action}\n地点：${e.place}\n状态：${e.status}`).join('\n\n')}`;
  return `节点\n${v.nodes.map(n=>n.id+'：'+n.label).join('\n')}\n\n连线\n${v.edges.map(e=>`${e.from} → ${e.to}：${e.label}`).join('\n')}\n\n${v.note}`;
}
export async function imageWord(input,fonts=null,pairing=null){const d=cleanImage(input);const text=imageTranscript(d);const {assertCovered}=await import('../shared/font-policy.js');await assertCovered(d.title+text,pairing);return new Blob([await wordBytes({title:d.title+' · 内容转录',blocks:[{type:'paragraph',text}],fonts})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}
export function imagePages(input){
  const d=cleanImage(input),v=d.data,parts=[];
  if(d.kind==='chat'){
    const w=750,h=1100,titleLines=wrapText(d.title,w-60,23),top=65+titleLines.length*28;let y=top,body='';
    function next(){if(parts.length>=200)throw Error('图片超过200页，请拆分');parts.push(body);body='';y=top;}
    for(const m of v.messages){
      const lines=wrapText(m.body,480,18);let offset=0;
      do{
        if(y+100>h-85)next();
        const take=Math.max(1,Math.floor((h-85-y-64)/28)),chunk=lines.slice(offset,offset+take),bh=chunk.length*28+24,x=m.side==='left'?62:168;
        body+=svgText((offset?'续：':'')+m.time+'　'+v[m.side],x,y,13,'fill="#62706a"');y+=17;
        body+=`<rect x="${x}" y="${y}" width="520" height="${bh}" rx="12" fill="${m.side==='left'?'#ffffff':'#cce9c5'}" stroke="#dce2dd"/>`;
        chunk.forEach((s,i)=>body+=svgText(s,x+18,y+30+i*28,18));y+=bh+30;offset+=chunk.length;
      }while(offset<lines.length);
    }
    if(body)next();
    return parts.map((b,i)=>svgPage(w,h,`<rect width="${w}" height="${h-60}" fill="#eef1ed"/>${titleLines.map((s,j)=>svgText(s,30,42+j*28,23,'font-weight="bold"')).join('')}${b}`,'聊天截图示例',i+1,parts.length));
  }
  if(d.kind==='webpage'){
    const w=900,h=1200,background='<rect width="900" height="1140" fill="#edf2ed"/>';let y=70,b=background;
    function next(){parts.push(b);b=background+svgText(d.title+'（续）',55,40,18);y=85;}
    function put(value,size=18,color='#25312b'){
      for(const line of wrapText(value,w-110,size)){
        if(y+30>h-90)next();b+=svgText(line,55,y,size,`fill="${color}"`);y+=size+12;
      }
      y+=12;
    }
    const titleLines=wrapText(d.title,w-110,27),bannerHeight=titleLines.length*39+35;
    b+=`<rect x="25" y="25" width="850" height="${bannerHeight}" rx="7" fill="#315c47"/>`;
    titleLines.forEach((line,i)=>b+=svgText(line,55,65+i*39,27,'fill="white" font-weight="bold"'));y=25+bannerHeight+35;
    put('合成页面 · 非实际抓取',14,'#6c756e');put('地址：'+v.url,14);put('记载时间：'+v.capturedAt,14);put('页面主体：'+v.seller,18);
    for(const [i,p] of v.products.entries()){
      const lines=[...wrapText(p.name,565,21).map(text=>({text,size:21,color:'#25312b'})),...wrapText('价格记载：'+p.price,565,21).map(text=>({text,size:21,color:'#99502c'})),...wrapText(p.description,565,17).map(text=>({text,size:17,color:'#536257'}))];
      let offset=0;
      do{
        if(y+170>h-90)next();
        const take=Math.max(1,Math.floor((h-90-y-44)/31)),chunk=lines.slice(offset,offset+take),height=Math.max(160,chunk.length*31+44);
        b+=`<rect x="35" y="${y}" width="830" height="${height}" rx="7" fill="white" stroke="#d8e1d7"/><rect x="55" y="${y+20}" width="160" height="120" rx="5" fill="#dbe7d9"/>`;
        b+=svgText('商品示例 '+(i+1),135,y+86,18,'text-anchor="middle" fill="#52724f"');
        chunk.forEach((line,j)=>b+=svgText(line.text,245,y+35+j*31,line.size,`fill="${line.color}"`));y+=height+20;offset+=chunk.length;
      }while(offset<lines.length);
    }
    put('公示与其他信息',20);put(v.disclosure,16);if(b)next();
    return parts.map((part,i)=>svgPage(w,h,part,'网页示例',i+1,parts.length));
  }
  if(d.kind==='attendance')return v.events.map((e,i)=>{
    const w=700;let b='',y=60;
    function lines(value,size=22,gap=28){for(const s of wrapText(value,w-100,size)){b+=svgText(s,50,y,size);y+=size+12;}y+=gap;}
    lines(v.system,23,12);lines(v.person,17,40);lines(e.date,23);lines(e.action,28,85);
    b+=`<circle cx="350" cy="${y}" r="60" fill="#3d785a"/>${svgText('已记录',350,y+10,24,'text-anchor="middle" fill="white"')}`;y+=125;
    lines(e.status,24);lines('记录时间：'+e.time,22);lines('地点：'+e.place,18);
    return svgPage(w,Math.max(1050,y+90),b,'考勤截图示例',i+1,v.events.length);
  });
  const w=1000,rows=Math.ceil(v.nodes.length/3),h=Math.max(850,210+rows*250+250),positions=new Map(v.nodes.map((n,i)=>[n.id,{x:50+(i%3)*320,y:210+Math.floor(i/3)*250}]));
  let b=`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#537966"/></marker></defs>`;
  wrapText(d.title,900,26).forEach((s,i)=>b+=svgText(s,50,55+i*34,26,'font-weight="bold"'));
  for(const e of v.edges){const a=positions.get(e.from),z=positions.get(e.to),dx=z.x-a.x,dy=z.y-a.y,distance=Math.hypot(dx,dy),boundary=Math.min(130/Math.max(Math.abs(dx),.001),110/Math.max(Math.abs(dy),.001)),t=boundary+6/distance;b+=`<line x1="${a.x+130+dx*t}" y1="${a.y+110+dy*t}" x2="${z.x+130-dx*t}" y2="${z.y+110-dy*t}" stroke="#537966" stroke-width="2" marker-end="url(#arrow)"/>`;}
  for(const n of v.nodes){const p=positions.get(n.id);b+=`<rect x="${p.x}" y="${p.y}" width="260" height="220" rx="6" fill="#eef3ee" stroke="#537966"/>${svgText(n.id,p.x+15,p.y+25,13,'fill="#68756d"')}`;wrapText(n.label,230,17).forEach((s,j)=>b+=svgText(s,p.x+15,p.y+60+j*22,17));}
  const legend=v.edges.map(e=>e.from+' → '+e.to+(e.label?'：'+e.label:'')).join('；');
  // Long edge legends and explanatory notes continue on separate pages instead of clipping.
  const noteY=210+rows*250+20,notes=wrapText('连线：'+legend+'\n说明：'+v.note,900,15),room=Math.floor((h-90-noteY)/24);
  notes.slice(0,room).forEach((s,i)=>b+=svgText(s,50,noteY+i*24,15));parts.push(b);
  for(let i=room;i<notes.length;i+=35)parts.push(svgText(d.title+' · 连线与说明（续）',50,70,22)+notes.slice(i,i+35).map((s,j)=>svgText(s,50,130+j*24,15)).join(''));
  return parts.map((part,i)=>svgPage(w,h,part,'关系与流程示意图',i+1,parts.length));
}
