export function matchTemplate(templates, project) {
    const current = templates.find((item) => item.id === project.template_id);
    if (!current) return { status: "missing", message: "找不到对应的证照种类" };
    const day = project.values["certificate.issued_on"] || (project.preserveMissing ? project.templateDate : "") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number(day.slice(0, 4)) < 1) {
      return { status: "incomplete", message: "填写完整发证日期后，自动匹配对应版式" };
    }
    const date = new Date(day + "T00:00:00Z");
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
      return { status: "incomplete", message: "请填写有效的发证日期" };
    }
    const matches = templates.filter((item) => item.kind === current.kind && item.medium === current.medium
      && item.issuer_scopes.includes(project.issuer_scope) && item.valid_from <= day
      && (!item.valid_through || day <= item.valid_through));
    if (!matches.length) return { status: "missing", message: "尚未收录 " + day + " 对应地区的版式，需补充历史模板后生成" };
    if (matches.length > 1) return { status: "ambiguous", message: "此日期匹配多个版式，需要进一步区分发证机关或证照类型" };
    return { status: "matched", template: matches[0] };
  }
