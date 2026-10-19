import React, { useEffect, useRef, useState } from "react";
import {
  definitions,
  cleanBusiness,
  businessFile,
  businessBlocks,
  formatsFor,
  displayCell,
} from "./model.js";
import { exampleBusiness, exampleLedger, ledgerNames } from "./examples.js";
import { queueEditorBatch } from "../shared/adapters.js";
const KEY = "material-center-business-v1",
  clone = (x) => structuredClone(x);
const fresh = (kind) => {
  const d = kind.startsWith("ledger:") ? exampleLedger(kind.split(":")[1]) : exampleBusiness(kind);
  return { ...d, id: crypto.randomUUID() };
};
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Table({ value, onChange }) {
  return (
    <div className="grid-wrap">
      <table>
        <thead>
          <tr>
            {value.headers.map((h, c) => (
              <th key={c}>
                <input
                  aria-label={"表头" + (c + 1)}
                  value={h}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      headers: value.headers.map((x, i) => (i === c ? e.target.value : x)),
                    })
                  }
                />
              </th>
            ))}
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {value.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>
                  <textarea
                    aria-label={"第" + (r + 1) + "行第" + (c + 1) + "列"}
                    value={cell}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        rows: value.rows.map((x, i) =>
                          i === r ? x.map((v, j) => (j === c ? e.target.value : v)) : x,
                        ),
                      })
                    }
                  />
                </td>
              ))}
              <td>
                <button
                  onClick={() => onChange({ ...value, rows: value.rows.filter((_, i) => i !== r) })}
                >
                  移除行
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => onChange({ ...value, rows: [...value.rows, value.headers.map(() => "")] })}
      >
        新增行
      </button>
      <button
        onClick={() =>
          onChange({
            ...value,
            headers: [...value.headers, "新列"],
            widths: [...value.widths, 1],
            rows: value.rows.map((r) => [...r, ""]),
          })
        }
      >
        新增列
      </button>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved?.schema === 1 && Array.isArray(saved.documents) && saved.documents.length) {
          saved.documents.forEach((x) => {
            if (
              !definitions.some((k) => k.id === x.kind) ||
              typeof x.id !== "string" ||
              typeof x.title !== "string" ||
              !x.fields ||
              typeof x.fields !== "object" ||
              !Array.isArray(x.blocks)
            )
              throw Error("保存的方案结构不完整");
            if (
              (x.kind === "email" && !Array.isArray(x.messages)) ||
              (x.kind === "interview" && !Array.isArray(x.dialogue)) ||
              (x.kind === "ledger" && (!Array.isArray(x.columns) || !Array.isArray(x.rows)))
            )
              throw Error("保存的明细结构不完整");
          });
          return saved;
        }
      } catch {}
      const d = fresh("interview");
      return { schema: 1, documents: [d], active: d.id };
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [json, setJson] = useState(""),
    file = useRef(null);
  const d = state.documents.find((x) => x.id === state.active) || state.documents[0],
    definition = definitions.find((x) => x.id === d.kind);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      setNotice("浏览器保存失败，请导出方案备份。");
    }
  }, [state]);
  const update = (value) =>
    setState((s) => ({
      ...s,
      documents: s.documents.map((x) => (x.id === d.id ? { ...x, ...value } : x)),
    }));
  const add = (kind) => {
    const doc = fresh(kind);
    setState((s) => ({ ...s, documents: [doc, ...s.documents], active: doc.id }));
    setNotice("已载入合成示例，请按本案资料修改。");
  };
  const perform = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setNotice("操作完成。");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  let blocks = [],
    error = "";
  try {
    blocks = businessBlocks(d);
  } catch (e) {
    error = e.message;
  }
  const changeBlock = (i, value) =>
    update({ blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...value } : b)) });
  async function importFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) throw Error("方案请控制在5MB内");
    const doc = cleanBusiness(JSON.parse(await f.text()));
    setState((s) => ({
      ...s,
      active: doc.id,
      documents: [doc, ...s.documents.filter((x) => x.id !== doc.id)],
    }));
  }
  return (
    <>
      <header>
        <a href={import.meta.env.BASE_URL}>← 素材中心</a>
        <div>
          <h1>业务文书</h1>
          <p>合同履行 · 访谈邮件 · 业务台账</p>
        </div>
        <div className="buttons">
          <button onClick={() => file.current.click()}>导入方案</button>
          <input
            hidden
            type="file"
            ref={file}
            accept=".json"
            onChange={(e) => importFile(e).catch((e) => setNotice(e.message))}
          />
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
                d.title + "_方案.json",
              )
            }
          >
            导出方案
          </button>
          <button
            className="primary"
            disabled={busy || !!error}
            onClick={perform(() => queueEditorBatch("business", d))}
          >
            送入批量制作
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="studio">
        <aside>
          <h2>新建材料</h2>
          {["合同履行", "沟通与说明"].map((group) => (
            <section key={group}>
              <h3>{group}</h3>
              {definitions
                .filter((x) => x.group === group)
                .map((x) => (
                  <button key={x.id} onClick={() => add(x.id)}>
                    {x.title}
                  </button>
                ))}
            </section>
          ))}
          <h3>业务台账</h3>
          {Object.entries(ledgerNames).map(([key, name]) => (
            <button key={key} onClick={() => add("ledger:" + key)}>
              {name}
            </button>
          ))}
          <h2>已保存材料</h2>
          {state.documents.map((x) => (
            <button
              className={d.id === x.id ? "selected" : ""}
              key={x.id}
              onClick={() => setState((s) => ({ ...s, active: x.id }))}
            >
              {x.title}
            </button>
          ))}
        </aside>
        <main>
          <h2>{definition.title}</h2>
          <label>
            文档名称
            <input
              value={d.title}
              maxLength={150}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          {definition.fields.map(([key, label, type]) => (
            <label key={key}>
              {label}
              <input
                value={d.fields[key]}
                onChange={(e) => update({ fields: { ...d.fields, [key]: e.target.value } })}
                placeholder={type === "date" ? "YYYY-MM-DD 或 未载明" : ""}
              />
            </label>
          ))}
          {d.kind === "interview" && (
            <section>
              <h3>访谈问答</h3>
              {d.dialogue.map((q, i) => (
                <div className="block" key={i}>
                  <label>
                    问题
                    <textarea
                      value={q.question}
                      onChange={(e) =>
                        update({
                          dialogue: d.dialogue.map((x, j) =>
                            j === i ? { ...x, question: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    回答
                    <textarea
                      rows={4}
                      value={q.answer}
                      onChange={(e) =>
                        update({
                          dialogue: d.dialogue.map((x, j) =>
                            j === i ? { ...x, answer: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    onClick={() => update({ dialogue: d.dialogue.filter((_, j) => j !== i) })}
                  >
                    移除此问答
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  update({ dialogue: [...d.dialogue, { question: "新问题", answer: "待填写" }] })
                }
              >
                新增问答
              </button>
            </section>
          )}
          {d.kind === "email" && (
            <section>
              <h3>往来邮件</h3>
              {d.messages.map((m, i) => (
                <div className="block" key={i}>
                  {[
                    ["from", "发件人"],
                    ["to", "收件人"],
                    ["cc", "抄送"],
                    ["date", "时间（含时区）"],
                    ["subject", "主题"],
                    ["body", "正文"],
                    ["deliveryRecord", "独立回执记载（可选）"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={key === "body" ? 5 : 2}
                        value={m[key]}
                        onChange={(e) =>
                          update({
                            messages: d.messages.map((x, j) =>
                              j === i ? { ...x, [key]: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    附件名称（每行一个）
                    <textarea
                      value={m.attachments.join("\n")}
                      onChange={(e) =>
                        update({
                          messages: d.messages.map((x, j) =>
                            j === i
                              ? { ...x, attachments: e.target.value.split("\n").filter(Boolean) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    onClick={() => update({ messages: d.messages.filter((_, j) => j !== i) })}
                  >
                    移除此邮件
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  update({
                    messages: [
                      ...d.messages,
                      {
                        ...clone(d.messages.at(-1) || exampleBusiness("email").messages[0]),
                        subject: "新邮件",
                        body: "待填写",
                        attachments: [],
                      },
                    ],
                  })
                }
              >
                新增邮件
              </button>
            </section>
          )}
          {d.kind === "ledger" && (
            <section>
              <h3>台账字段与数据</h3>
              <p className="hint">
                金额按元填写；编号使用文本列，以保留前导零。空白字段按未载处理。
              </p>
              <div className="grid-wrap">
                <table>
                  <thead>
                    <tr>
                      {d.columns.map((c, i) => (
                        <th key={c.key}>
                          <input
                            value={c.label}
                            aria-label={"列名" + (i + 1)}
                            onChange={(e) =>
                              update({
                                columns: d.columns.map((x, j) =>
                                  j === i ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <select
                            value={c.type}
                            aria-label={"列类型" + (i + 1)}
                            onChange={(e) =>
                              update({
                                columns: d.columns.map((x, j) =>
                                  j === i ? { ...x, type: e.target.value } : x,
                                ),
                              })
                            }
                          >
                            {Object.entries({
                              text: "文本",
                              date: "日期",
                              money: "金额",
                              number: "数值",
                              boolean: "是或否",
                            }).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r, i) => (
                      <tr key={i}>
                        {d.columns.map((c) => (
                          <td key={c.key}>
                            <input
                              value={displayCell(r[c.key], c)}
                              aria-label={"第" + (i + 1) + "行 " + c.label}
                              onChange={(e) => {
                                let value = e.target.value;
                                if (value === "") value = null;
                                else if (c.type === "money")
                                  value = /^-?\d+(\.\d{0,2})?$/.test(value)
                                    ? Math.round(Number(value) * 100)
                                    : value;
                                else if (c.type === "number") value = Number(value);
                                else if (c.type === "boolean") value = value === "是";
                                update({
                                  rows: d.rows.map((x, j) =>
                                    j === i ? { ...x, [c.key]: value } : x,
                                  ),
                                });
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() =>
                  update({
                    rows: [...d.rows, Object.fromEntries(d.columns.map((c) => [c.key, null]))],
                  })
                }
              >
                新增数据行
              </button>
              <button
                onClick={() =>
                  update({
                    columns: [
                      ...d.columns,
                      { key: "column-" + d.columns.length, label: "新列", type: "text", width: 20 },
                    ],
                  })
                }
              >
                新增字段
              </button>
            </section>
          )}
          <h3>正文与表格</h3>
          {d.blocks.map((b, i) => (
            <div className="block" key={i}>
              {b.type === "table" ? (
                <Table value={b} onChange={(value) => changeBlock(i, value)} />
              ) : (
                <label>
                  {b.type === "heading" ? "小标题" : "段落"}
                  <textarea
                    rows={b.type === "heading" ? 2 : 5}
                    value={b.text}
                    onChange={(e) => changeBlock(i, { text: e.target.value })}
                  />
                </label>
              )}
              <button onClick={() => update({ blocks: d.blocks.filter((_, j) => j !== i) })}>
                移除此项
              </button>
            </div>
          ))}
          <div className="buttons">
            <button
              onClick={() =>
                update({ blocks: [...d.blocks, { type: "heading", text: "新小标题" }] })
              }
            >
              新增标题
            </button>
            <button
              onClick={() =>
                update({ blocks: [...d.blocks, { type: "paragraph", text: "待填写" }] })
              }
            >
              新增段落
            </button>
            <button
              onClick={() =>
                update({
                  blocks: [
                    ...d.blocks,
                    { type: "table", headers: ["项目", "内容"], rows: [["", ""]], widths: [1, 2] },
                  ],
                })
              }
            >
              新增表格
            </button>
          </div>
          <details>
            <summary>编辑完整方案 JSON</summary>
            <button onClick={() => setJson(JSON.stringify(d, null, 2))}>载入当前方案</button>
            <textarea
              aria-label="完整业务文书JSON"
              rows={18}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <button
              onClick={() => {
                try {
                  update(cleanBusiness(JSON.parse(json)));
                  setNotice("已更新方案。");
                } catch (e) {
                  setNotice(e.message);
                }
              }}
            >
              应用修改
            </button>
          </details>
        </main>
        <section className="preview">
          <div className="preview-heading">
            <h2>内容预览</h2>
            <span>{error || "可导出"}</span>
          </div>
          <article className="paper">
            <p className="synthetic">合成案例材料</p>
            <h1>{d.title}</h1>
            {error ? (
              <p className="error">{error}</p>
            ) : (
              blocks.map((b, i) =>
                b.type === "table" ? (
                  <div className="grid-wrap" key={i}>
                    <table>
                      <thead>
                        <tr>
                          {b.headers.map((h, c) => (
                            <th key={c}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : b.type === "heading" ? (
                  <h2 key={i}>{b.text}</h2>
                ) : (
                  <p key={i}>{b.text}</p>
                ),
              )
            )}
          </article>
          <div className="buttons export">
            {formatsFor(d).map((format) => (
              <button
                disabled={busy || !!error}
                key={format}
                onClick={perform(async () =>
                  download(await businessFile(d, format), d.title + "." + format),
                )}
              >
                下载 {format.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="hint">
            预览展示正文结构；Word 根据纸张分页。日期、状态与确认意见分别保存。
          </p>
        </section>
      </div>
    </>
  );
}
