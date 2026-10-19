import {queueEditorBatch} from '../shared/adapters.js';
import React, { useEffect, useRef, useState } from "react";
import { templates, examples } from "./templates.js";
import {
  STORAGE_KEY,
  clone,
  uid,
  fields,
  cleanTemplate,
  cleanDraft,
  newDraft,
  loadState,
  writeState,
  missingFields,
  renderDraft,
  parseFacts,
  changes,
  fromText,
} from "./model.js";
import { download, downloadJSON, readImport, exportContract } from "./files.js";
function StructuredTables({tables=[],onChange}) {
  const change=(index,value)=>onChange(tables.map((t,i)=>i===index?value:t));
  return <div className="structured-tables">{tables.map((t,index)=><div key={index} className="structured-table"><table><thead><tr>{t.headers.map((h,col)=><th key={col}><input aria-label={'表'+(index+1)+'列'+(col+1)+'标题'} value={h} onChange={e=>change(index,{...t,headers:t.headers.map((x,i)=>i===col?e.target.value:x)})}/></th>)}</tr></thead><tbody>{t.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c}><textarea aria-label={'表'+(index+1)+'行'+(r+1)+'列'+(c+1)} value={cell} onChange={e=>change(index,{...t,rows:t.rows.map((line,i)=>i===r?line.map((x,j)=>j===c?e.target.value:x):line)})}/></td>)}</tr>)}</tbody></table><div className="actions"><button onClick={()=>change(index,{...t,rows:[...t.rows,t.headers.map(()=>'')]})}>新增行</button><button onClick={()=>change(index,{...t,headers:[...t.headers,'新列'],widths:[...t.widths,1],rows:t.rows.map(row=>[...row,''])})}>新增列</button><button onClick={()=>onChange(tables.filter((_,i)=>i!==index))}>移除此表</button></div></div>)}<button onClick={()=>onChange([...tables,{headers:['项目','内容'],rows:[['','']],widths:[1,2]}])}>添加结构化表格</button></div>;
}

let bootError = "";
const initial = () => {
  try {
    return loadState(localStorage, templates);
  } catch (e) {
    bootError = e.message;
    return loadState({ getItem: () => null }, templates);
  }
};
export default function App() {
  const [state, setState] = useState(initial),
    [saveStatus, setSaveStatus] = useState("正在保存"),
    [notice, setNotice] = useState(""),
    [modalError, setModalError] = useState(""),
    [tab, setTab] = useState("fields"),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [templateEdit, setTemplateEdit] = useState(null),
    [plainTitle, setPlainTitle] = useState(""),
    [plainBody, setPlainBody] = useState(""),
    [suggestions, setSuggestions] = useState(null),
    [selected, setSelected] = useState({});
  useEffect(() => setModalError(""), [modal]);
  const input = useRef(null),
    templateInput = useRef(null);
  const draft = state.drafts.find((d) => d.id === state.active) || state.drafts[0];
  const newerTemplate = templates.find(
    (t) => t.id === draft.template.id && t.version > draft.template.version,
  );
  const jumpTo = (prefix, value) => {
    if (value) document.getElementById(prefix + value)?.scrollIntoView({ block: "start" });
  };
  const allTemplates = [...templates, ...state.templates],
    keys = fields(draft),
    missing = missingFields(draft),
    preview = renderDraft(draft),
    diff = changes(draft);
  useEffect(() => {
    if (bootError) {
      setSaveStatus("未保存：原数据已保护");
      return;
    }
    try {
      state.drafts.forEach(cleanDraft);
      writeState(localStorage, state);
      setSaveStatus("已保存到此浏览器");
    } catch (e) {
      setSaveStatus("尚未保存：" + e.message);
    }
  }, [state]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const update = (patch) =>
    setState((s) => ({
      ...s,
      drafts: s.drafts.map((d) =>
        d.id === s.active ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
      ),
    }));
  const updateClause = (id, patch) =>
    update({ clauses: draft.clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addDraft = (t) => {
    if (state.drafts.length >= 100) {
      setNotice("案件方案已达100份，请备份并删除不用的方案");
      return;
    }
    const d = newDraft(t);
    setState((s) => ({ ...s, drafts: [...s.drafts, d], active: d.id }));
    setTab("fields");
    setModal(null);
    setNotice("已创建案件副本，模板版本已固定。");
  };
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e.message);
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openTemplate = (t) => {
    setTemplateEdit(clone(t));
    setModal("template");
  };
  const saveTemplate = () => {
    try {
      if (state.templates.length >= 100) throw Error("自定义模板已达100份，请先备份并整理");
      const uploading = modal === "upload";
      const t = cleanTemplate({
        ...templateEdit,
        id: uid(),
        version: templateEdit.version + (uploading ? 0 : 1),
      });
      setState((s) => ({ ...s, templates: [...s.templates, t] }));
      setModal(null);
      setNotice(
        uploading
          ? "你的模板已存入模板库，点击“用此模板新建”即可填写案件。"
          : "已保存新模板版本，已有案件保持原版本。",
      );
    } catch (e) {
      setNotice(e.message);
      setModalError(e.message);
    }
  };
  const previewTemplate = async (file) => {
    if (!file) return;
    setTemplateEdit(null);
    setModalError("");
    await run(async () => {
      const result = await readImport(file);
      if (!result.template) throw Error("这里接受合同模板。案件方案或整库备份请从顶部“导入”恢复。");
      setTemplateEdit(result.template);
    });
  };
  const importFile = async (file) => {
    if (!file) return;
    await run(async () => {
      const result = await readImport(file);
      if (result.template) {
        if (state.templates.length >= 100) throw Error("模板库已达100份");
        setTemplateEdit(result.template);
        setModal("upload");
      } else if (result.draft) {
        if (state.drafts.length >= 100) throw Error("案件方案已达100份");
        const d = { ...result.draft, id: uid() };
        setState((s) => ({ ...s, drafts: [...s.drafts, d], active: d.id }));
        setNotice("案件方案已恢复为新副本。");
      } else if (result.state) {
        if (
          state.templates.length + result.state.templates.length > 100 ||
          state.drafts.length + result.state.drafts.length > 100
        )
          throw Error("合并后将超过100份上限，请分次导入方案");
        const drafts = result.state.drafts.map((d) => ({ ...d, id: uid() }));
        setState((s) => ({
          ...s,
          templates: [...s.templates, ...result.state.templates.map((t) => ({ ...t, id: uid() }))],
          drafts: [...s.drafts, ...drafts],
          active: drafts[0].id,
        }));
        setNotice("备份已合并为新副本，没有覆盖现有案件。");
      }
    });
  };
  const recognize = () => {
    try {
      const r = parseFacts(draft.caseText, keys);
      if (!Object.keys(r.values).length) {
        setNotice("没有匹配字段。请使用左侧字段的完整名称，每行填写“字段名称：内容”。");
        return;
      }
      setSuggestions(r);
      setSelected(Object.fromEntries(Object.keys(r.values).map((k) => [k, true])));
      setModal("facts");
    } catch (e) {
      setNotice(e.message);
      setModalError(e.message);
    }
  };
  const openText = () => {
    setPlainTitle("");
    setPlainBody("");
    setModal("text");
  };
  const createText = () => {
    try {
      if (state.templates.length >= 100) throw Error("模板库已达100份");
      const t = fromText(plainTitle, plainBody);
      setState((s) => ({ ...s, templates: [...s.templates, t] }));
      setModal(null);
      setNotice("正文已保存到模板库。");
    } catch (e) {
      setNotice(e.message);
      setModalError(e.message);
    }
  };
  const backup = () =>
    downloadJSON({ kind: "contract-backup", schema: 1, state }, "合同工作台-完整备份.json");
  const move = (i, delta) => {
    const list = [...draft.clauses];
    [list[i], list[i + delta]] = [list[i + delta], list[i]];
    update({ clauses: list });
  };
  return (
    <>
      <header className="topbar">
        <a className="back" href={import.meta.env.BASE_URL}>
          ← 素材中心
        </a>
        <div className="brand-mark">约</div>
        <div className="brand">
          <strong>合同制作</strong>
          <span>从模板，到一份具体的合同</span>
        </div>
        <div className="top-actions">
          <span className={saveStatus.startsWith("已") ? "saved" : "unsaved"}>{saveStatus}</span>
          <button disabled={busy} onClick={()=>queueEditorBatch("contracts",draft).catch(e=>setNotice(e.message))}>批量制作当前合同</button>
          <button onClick={backup}>备份工作台</button>
          <button onClick={() => input.current.click()}>导入</button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".docx,.json"
          hidden
          onChange={(e) => {
            importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>
      {bootError && (
        <div className="banner error">
          {bootError}。当前可继续编辑并导出文件，但不会覆盖浏览器原数据。
          <button
            onClick={() =>
              run(async () =>
                download(
                  localStorage.getItem(STORAGE_KEY) || "",
                  "合同工作台-原始数据.txt",
                  "text/plain",
                ),
              )
            }
          >
            导出原始数据
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="banner">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div className="workspace">
        <aside className="library">
          <div className="section-top">
            <span className="eyebrow">TEMPLATE LIBRARY</span>
            <span className="count">{allTemplates.length}</span>
          </div>
          <h1>
            选一份模板，
            <br />
            开始新的案件。
          </h1>
          <p className="muted">
            模板保留原稿；字段与条款的调整
            <br />
            存为案件副本。
          </p>
          <button
            className="upload-template"
            onClick={() => {
              setTemplateEdit(null);
              setModal("upload");
            }}
          >
            ↑ 上传我的模板
          </button>
          <label className="search">
            <span>⌕</span>
            <input
              aria-label="搜索模板"
              placeholder="搜索模板或类型"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="template-list">
            {allTemplates
              .filter((t) => (t.title + t.category).includes(search))
              .map((t) => (
                <article
                  className={"template-card " + (draft.template.id === t.id ? "active" : "")}
                  key={t.id}
                >
                  <div className="card-meta">
                    <span>{t.category}</span>
                    <span>
                      v{t.version} · {templates.some((x) => x.id === t.id) ? "内置" : "自定义"}
                    </span>
                  </div>
                  <h2>{t.title}</h2>
                  <p>
                    {t.clauses.length} 组条款 · {fields(t).length} 个案件字段
                    <br />约{" "}
                    {(
                      t.clauses.reduce((n, c) => n + c.title.length + c.body.length, 0) / 10000
                    ).toFixed(1)}{" "}
                    万字符
                    {" · "}
                    {
                      t.clauses.filter((c) => /^附件[一二三四五六七八九十\d]/.test(c.title)).length
                    }{" "}
                    份附件
                  </p>
                  <div className="card-actions">
                    <button className="link" onClick={() => addDraft(t)}>
                      用此模板新建 <span>↗</span>
                    </button>
                    <button className="quiet" onClick={() => openTemplate(t)}>
                      查看 / 编辑
                    </button>
                  </div>
                </article>
              ))}
          </div>
          <button className="add-template" onClick={openText}>
            ＋ 添加正文模板
          </button>
          <p className="tiny">
            支持导入 DOCX 正文与工作台 JSON。DOCX 将重新排版，不保留图片、表格布局和页眉页脚。
          </p>
          <div className="library-footer">
            <span className="small-dot" />
            数据保存在本机浏览器<div>换浏览器或清理缓存前，请先备份。</div>
          </div>
        </aside>
        <main className="editor">
          <div className="editor-heading">
            <div>
              <span className="eyebrow">CASE WORKSPACE</span>
              <h2>案件方案</h2>
            </div>
            <button
              className="quiet"
              onClick={() => {
                setModal("cases");
              }}
            >
              管理方案 <span className="count">{state.drafts.length}</span>
            </button>
          </div>
          <label className="field">
            <span>当前案件</span>
            <select
              value={draft.id}
              onChange={(e) => {
                setState((s) => ({ ...s, active: e.target.value }));
                setSuggestions(null);
              }}
            >
              {state.drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              方案名称 <small>用于保存与文件命名</small>
            </span>
            <input
              maxLength={150}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <div className="source-note">
            来源：{draft.template.title} <b>v{draft.template.version}</b>
            <span>已固定模板版本</span>
          </div>
          {newerTemplate && (
            <div className="version-update">
              <span>完整 v{newerTemplate.version} 已上线；当前案件保留原稿。</span>
              <button onClick={() => addDraft(newerTemplate)}>
                用完整 v{newerTemplate.version} 新建
              </button>
            </div>
          )}
          <nav className="tabs" aria-label="编辑内容">
            {[
              ["fields", "案件字段"],
              ["clauses", "条款调整"],
              ["changes", "修改对照"],
            ].map(([id, name]) => (
              <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
                {name}
                {id === "changes" && diff.length > 0 && <b>{diff.length}</b>}
              </button>
            ))}
          </nav>
          {tab === "clauses" && (
            <label className="clause-jump">
              <span>定位条款</span>
              <select
                aria-label="定位编辑条款"
                value=""
                onChange={(e) => jumpTo("edit-", e.target.value)}
              >
                <option value="">选择正文或附件…</option>
                {draft.clauses.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {c.title || `条款 ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="editor-scroll" key={draft.id}>
            {tab === "fields" && (
              <>
                <section className="case-import">
                  <div className="section-top">
                    <h3>带入案件信息</h3>
                    {examples[draft.template.id] && (
                      <button className="link" onClick={() => setModal("example")}>
                        使用示例数据
                      </button>
                    )}
                  </div>
                  <p>
                    粘贴“字段名称：内容”或字段
                    JSON，核对后填入。自由叙述可保存在这里，暂不做模型改写。
                  </p>
                  <textarea
                    aria-label="案件背景与字段"
                    rows={4}
                    maxLength={60000}
                    value={draft.caseText}
                    placeholder={`${keys[0] || "字段名称"}：填写案件内容\n${keys[1] || "另一字段"}：填写案件内容`}
                    onChange={(e) => update({ caseText: e.target.value })}
                  />
                  <button onClick={recognize}>识别字段并核对</button>
                </section>
                <div className="section-top field-title">
                  <h3>逐项填写</h3>
                  <span className={missing.length ? "muted" : "good"}>
                    {keys.length - missing.length} / {keys.length} 已填写
                  </span>
                </div>
                {keys.map((k) => (
                  <label className="field" key={k}>
                    <span>
                      {k}
                      {!draft.values[k]?.trim() && <i>待填</i>}
                    </span>
                    <textarea
                      rows={draft.values[k]?.length > 60 ? 3 : 2}
                      maxLength={12000}
                      value={draft.values[k] || ""}
                      placeholder={"填写" + k}
                      onChange={(e) => update({ values: { ...draft.values, [k]: e.target.value } })}
                    />
                  </label>
                ))}
                {!keys.length && (
                  <p className="empty">这份合同没有变量，可直接在“条款调整”中编辑正文。</p>
                )}
              </>
            )}
            {tab === "clauses" && (
              <>
                <p className="hint">
                  这里的改动仅影响当前案件。使用 <code>{"{{字段名称}}"}</code>{" "}
                  可添加可复用变量；删除变量后，原值仍保留在方案备份中。
                </p>
                <label className="field">
                  <span>合同标题</span>
                  <input
                    maxLength={150}
                    value={draft.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                {draft.clauses.map((c, i) => (
                  <section className="clause" id={"edit-" + c.id} key={c.id}>
                    <div className="section-top">
                      <b>条款 {String(i + 1).padStart(2, "0")}</b>
                      <div>
                        <button
                          aria-label={`上移条款${i + 1}`}
                          disabled={!i}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`下移条款${i + 1}`}
                          disabled={i === draft.clauses.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          disabled={draft.clauses.length === 1}
                          onClick={() => setModal({ deleteClause: c.id })}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <input
                      aria-label={`条款${i + 1}标题`}
                      maxLength={200}
                      value={c.title}
                      placeholder="条款标题（可选）"
                      onChange={(e) => updateClause(c.id, { title: e.target.value })}
                    />
                    <textarea
                      aria-label={`条款${i + 1}正文`}
                      rows={Math.min(14, Math.max(5, Math.ceil(c.body.length / 35)))}
                      maxLength={30000}
                      value={c.body}
                      onChange={(e) => updateClause(c.id, { body: e.target.value })}
                    />
                    <StructuredTables tables={c.tables} onChange={tables=>updateClause(c.id,{tables})}/>
                  </section>
                ))}
                <button
                  className="add-template"
                  disabled={draft.clauses.length >= 150}
                  onClick={() =>
                    update({
                      clauses: [...draft.clauses, { id: uid(), title: "新增条款", body: "" }],
                    })
                  }
                >
                  ＋ 增加条款
                </button>
                <button
                  className="wide"
                  onClick={() =>
                    openTemplate({ ...draft.template, title: draft.title, clauses: draft.clauses })
                  }
                >
                  将当前条款另存为模板
                </button>
              </>
            )}
            {tab === "changes" && (
              <>
                <div className="hint">
                  对照固定的模板原稿，展示条款内容变化。双方使用当前案件字段值；字段填入记录另列于下方。这里的对照不写入合同正文。
                </div>
                {draft.title !== draft.template.title && (
                  <div className="change-card">
                    <b>合同标题调整</b>
                    <p>
                      {draft.template.title} → {draft.title}
                    </p>
                  </div>
                )}
                {draft.template.clauses
                  .filter((c) => draft.clauses.some((x) => x.id === c.id))
                  .map((c) => c.id)
                  .join(",") !==
                  draft.clauses
                    .filter((c) => draft.template.clauses.some((x) => x.id === c.id))
                    .map((c) => c.id)
                    .join(",") && (
                  <div className="hint">条款顺序已调整，完整顺序保存在材料包的修改记录中。</div>
                )}
                {diff.map((c) => (
                  <article className="change-card" key={c.id}>
                    <b>{c.kind}</b>
                    {c.before && (
                      <div className="before">
                        <small>模板原稿</small>
                        <p>{c.before}</p>
                      </div>
                    )}
                    {c.after && (
                      <div className="after">
                        <small>案件版本</small>
                        <p>{c.after}</p>
                      </div>
                    )}
                  </article>
                ))}
                {!diff.length && <p className="empty">条款内容与模板一致。</p>}
                <h3>案件字段填入记录</h3>
                <dl className="value-list">
                  {Object.entries(draft.values)
                    .filter(([, v]) => String(v).trim())
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>
                          {k}
                          {!keys.includes(k) && "（当前未使用）"}
                        </dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              </>
            )}
          </div>
        </main>
        <section className="preview">
          <div className="preview-toolbar">
            <div>
              <span className="eyebrow">DOCUMENT PREVIEW</span>
              <h2>合同预览</h2>
            </div>
            <span className={"pill " + (missing.length ? "pending" : "complete")}>
              {missing.length ? `${missing.length} 项待填` : "字段已齐备"}
            </span>
          </div>
          <label className="clause-jump">
            <span>正文目录</span>
            <select
              aria-label="定位预览条款"
              value=""
              onChange={(e) => jumpTo("preview-", e.target.value)}
            >
              <option value="">选择正文或附件…</option>
              {preview.clauses.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {c.title || `条款 ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="paper-scroll">
            <div className="paper">
              {draft.synthetic && <div className="paper-label">合成案例材料</div>}
              <h1>{preview.title}</h1>
              {preview.clauses.map((c) => (
                <section id={"preview-" + c.id} key={c.id}>
                  {c.title && <h2>{c.title}</h2>}
                  {c.body.split("\n").map((p, i) => (
                    <p key={i}>
                      {p
                        .split(/(\{\{[^{}]+\}\})/g)
                        .map((s, j) => (s.startsWith("{{") ? <mark key={j}>{s}</mark> : s))}
                    </p>
                  ))}
                  {(c.tables||[]).map((t,j)=><table key={j}><thead><tr>{t.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{t.rows.map((row,i)=><tr key={i}>{row.map((cell,k)=><td key={k}>{cell}</td>)}</tr>)}</tbody></table>)}
                </section>
              ))}
            </div>
            <p className="preview-caption">预览展示正文内容；Word 根据页面尺寸自动分页。</p>
          </div>
          <footer className="export-panel">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.synthetic}
                onChange={(e) => update({ synthetic: e.target.checked })}
              />
              页眉标记“合成案例材料”
            </label>
            {missing.length > 0 && (
              <p className="export-hint">
                填完 {missing.length} 个字段后可导出 Word；未完成的方案可随时保存。
              </p>
            )}
            <div className="export-buttons">
              <button
                className="primary"
                disabled={busy || !!missing.length}
                onClick={() => run(() => exportContract(draft))}
              >
                {busy ? "正在处理…" : "下载 Word"}
              </button>
              <button
                disabled={busy || !!missing.length}
                onClick={() => run(() => exportContract(draft, true))}
              >
                下载材料包
              </button>
              <button
                onClick={() =>
                  downloadJSON({ kind: "contract-draft", draft }, draft.name + "-方案.json")
                }
              >
                保存方案
              </button>
            </div>
            <p>材料包包含合同 Word、案件方案与修改记录。</p>
          </footer>
        </section>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="工作台操作"
            className={"modal " + (["template", "upload"].includes(modal) ? "large" : "")}
          >
            <button className="modal-close" aria-label="关闭窗口" onClick={() => setModal(null)}>
              ×
            </button>
            {modalError && (
              <p className="modal-error" role="alert">
                {modalError}
              </p>
            )}
            {modal === "example" && (
              <>
                <h2>载入示例数据</h2>
                <p>
                  将用当前模板对应的虚构业务示例填写字段。现有同名字段会被替换，条款内容保留。
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button
                    className="primary"
                    onClick={() => {
                      update({
                        values: { ...draft.values, ...examples[draft.template.id] },
                        name: draft.template.title + " · 业务示例",
                        caseText: Object.entries(examples[draft.template.id])
                          .map(([k, v]) => k + "：" + v)
                          .join("\n"),
                      });
                      setModal(null);
                      setNotice("示例字段已填入，请结合实际案件调整。");
                    }}
                  >
                    填入示例
                  </button>
                </div>
              </>
            )}
            {modal === "facts" && (
              <>
                <h2>核对待填字段</h2>
                <p>勾选需要填入的内容。已填写的字段会显示原值。</p>
                <div className="suggestion-list">
                  {Object.entries(suggestions.values).map(([k, v]) => (
                    <label className="suggestion" key={k}>
                      <input
                        type="checkbox"
                        checked={selected[k]}
                        onChange={(e) => setSelected({ ...selected, [k]: e.target.checked })}
                      />
                      <span>
                        <b>{k}</b>
                        {draft.values[k] && <small>原值：{draft.values[k]}</small>}
                        <span>{String(v) || "（空值，将清空）"}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {!!suggestions.unknown.length && (
                  <p className="hint">未匹配到模板变量：{suggestions.unknown.join("、")}</p>
                )}
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button
                    className="primary"
                    onClick={() => {
                      update({
                        values: {
                          ...draft.values,
                          ...Object.fromEntries(
                            Object.entries(suggestions.values).filter(([k]) => selected[k]),
                          ),
                        },
                      });
                      setModal(null);
                      setNotice("所选字段已填入。");
                    }}
                  >
                    应用所选字段
                  </button>
                </div>
              </>
            )}
            {modal === "text" && (
              <>
                <h2>添加正文模板</h2>
                <p>
                  粘贴合同正文，将需要按案件变化的位置写成 {"{{字段名称}}"}。也可从顶部导入 Word
                  正文。
                </p>
                <label className="field">
                  <span>模板名称</span>
                  <input
                    value={plainTitle}
                    maxLength={150}
                    onChange={(e) => setPlainTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>正文</span>
                  <textarea
                    rows={12}
                    maxLength={300000}
                    value={plainBody}
                    onChange={(e) => setPlainBody(e.target.value)}
                    placeholder={"第一条 交易主体\n买方：{{买方名称}}\n卖方：{{卖方名称}}"}
                  />
                </label>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button className="primary" onClick={createText}>
                    保存为模板
                  </button>
                </div>
              </>
            )}
            {modal === "upload" && (
              <>
                <h2>上传我的模板</h2>
                <p>
                  选择 Word（.docx）或工作台模板
                  JSON，先核对正文，再保存到模板库。文件仅在本机浏览器处理。
                </p>
                <div className="upload-box">
                  <button disabled={busy} onClick={() => templateInput.current.click()}>
                    {busy ? "正在读取…" : templateEdit ? "重新选择文件" : "选择模板文件"}
                  </button>
                  <span>单文件不超过 5 MB · 旧版 .doc 请先另存为 .docx</span>
                  <input
                    ref={templateInput}
                    type="file"
                    accept=".docx,.json"
                    hidden
                    onChange={(e) => {
                      previewTemplate(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="import-note">
                  Word
                  导入正文并重新排版；图片、表格布局、页眉页脚和批注不会保留。含修订的文件须先在
                  Word 中接受或拒绝修订。
                </p>
              </>
            )}
            {(modal === "template" || modal === "upload") && templateEdit && (
              <>
                {modal === "template" && (
                  <>
                    <span className="eyebrow">TEMPLATE EDITOR</span>
                    <h2>查看与编辑模板</h2>
                    <p>保存会创建 v{templateEdit.version + 1} 新版本，现有模板与案件不受影响。</p>
                  </>
                )}
                <p className="import-summary">
                  {templateEdit.clauses.length} 组条款 · {fields(templateEdit).length}{" "}
                  个变量。将需要按案件替换的内容写成 {"{{买方名称}}"} 等变量；固定文字原样保留。
                  {fields(templateEdit).length
                    ? "已识别：" + fields(templateEdit).join("、")
                    : "目前没有变量，可以在下方正文中添加。"}
                </p>
                <div className="template-edit-scroll">
                  <label className="field">
                    <span>模板名称</span>
                    <input
                      value={templateEdit.title}
                      maxLength={150}
                      onChange={(e) => setTemplateEdit({ ...templateEdit, title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>分类</span>
                    <input
                      list="contract-categories"
                      value={templateEdit.category}
                      maxLength={40}
                      onChange={(e) =>
                        setTemplateEdit({ ...templateEdit, category: e.target.value })
                      }
                    />
                    <datalist id="contract-categories">
                      <option value="资产收购" />
                      <option value="客户承接" />
                      <option value="保密协议" />
                      <option value="其他" />
                    </datalist>
                  </label>
                  <label className="field">
                    <span>来源说明</span>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={templateEdit.source}
                      onChange={(e) => setTemplateEdit({ ...templateEdit, source: e.target.value })}
                    />
                  </label>
                  {templateEdit.clauses.map((c, i) => (
                    <div className="clause" key={c.id}>
                      <label className="field">
                        <span>条款 {i + 1}</span>
                        <input
                          maxLength={200}
                          value={c.title}
                          onChange={(e) =>
                            setTemplateEdit({
                              ...templateEdit,
                              clauses: templateEdit.clauses.map((x) =>
                                x.id === c.id ? { ...x, title: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <textarea
                        aria-label={`模板条款${i + 1}正文`}
                        rows={5}
                        maxLength={30000}
                        value={c.body}
                        onChange={(e) =>
                          setTemplateEdit({
                            ...templateEdit,
                            clauses: templateEdit.clauses.map((x) =>
                              x.id === c.id ? { ...x, body: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <StructuredTables tables={c.tables} onChange={tables=>setTemplateEdit({...templateEdit,clauses:templateEdit.clauses.map(x=>x.id===c.id?{...x,tables}:x)})}/>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button
                    onClick={() =>
                      run(async () =>
                        downloadJSON(
                          { kind: "contract-template", template: cleanTemplate(templateEdit) },
                          templateEdit.title + "-模板.json",
                        ),
                      )
                    }
                  >
                    导出模板 JSON
                  </button>
                  <button className="primary" disabled={busy} onClick={saveTemplate}>
                    {modal === "upload" ? "保存到模板库" : "另存新版本"}
                  </button>
                </div>
              </>
            )}
            {modal === "cases" && (
              <>
                <h2>管理案件方案</h2>
                <p>删除前可导出单个方案，或备份整个工作台。</p>
                <div className="case-list">
                  {state.drafts.map((d) => (
                    <div key={d.id}>
                      <span>
                        <b>{d.name || "未命名案件"}</b>
                        <small>
                          {d.template.title} · v{d.template.version}
                        </small>
                      </span>
                      <button
                        onClick={() =>
                          downloadJSON({ kind: "contract-draft", draft: d }, d.name + "-方案.json")
                        }
                      >
                        导出
                      </button>
                      <button
                        disabled={state.drafts.length === 1}
                        onClick={() => setModal({ deleteDraft: d.id })}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <h3>自定义模板</h3>
                {state.templates.map((t) => (
                  <div className="managed-template" key={t.id}>
                    <span>
                      {t.title} · v{t.version}
                    </span>
                    <button onClick={() => setModal({ deleteTemplate: t.id })}>删除</button>
                  </div>
                ))}
                {!state.templates.length && <p className="muted">暂无自定义模板。</p>}
              </>
            )}
            {typeof modal === "object" && (
              <>
                <h2>确认删除</h2>
                <p>
                  {modal.deleteClause
                    ? "删除这条案件条款后，可从原模板查看原文。"
                    : modal.deleteDraft
                      ? "删除此案件方案。建议先导出方案备份。"
                      : "从模板库删除此自定义模板，已创建的案件副本仍保留。"}
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (modal.deleteClause)
                        update({
                          clauses: draft.clauses.filter((c) => c.id !== modal.deleteClause),
                        });
                      if (modal.deleteDraft)
                        setState((s) => {
                          const ds = s.drafts.filter((d) => d.id !== modal.deleteDraft);
                          return {
                            ...s,
                            drafts: ds,
                            active: ds.some((d) => d.id === s.active) ? s.active : ds[0].id,
                          };
                        });
                      if (modal.deleteTemplate)
                        setState((s) => ({
                          ...s,
                          templates: s.templates.filter((t) => t.id !== modal.deleteTemplate),
                        }));
                      setModal(null);
                    }}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
