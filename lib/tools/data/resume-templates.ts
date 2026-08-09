/**
 * 職種別の英文レジュメテンプレート（サンプル）。
 *
 * これは記入例のひな型です。実際の経歴・スキルに合わせて必ず書き換えてください。
 * 一般的な採用慣行に沿った構成の目安であり、最適な形は職種・企業により異なります。
 *
 * 構造化ドキュメント（StructuredDoc）を唯一の情報源とし、プレビュー・Word(.docx)・
 * PDF・テキストのすべてをこのデータから生成する（内容の食い違いを防ぐ）。
 */

import type { StructuredDoc } from "@/lib/tools/documents/types";

const CONTACT = "[Suburb, State] | [Phone] | [Email]";
const VISA = "Working Holiday visa (subclass 417) – full working rights";

const HOSPITALITY: StructuredDoc = {
  id: "hospitality",
  label: "接客・ホスピタリティ",
  fileBaseName: "resume-hospitality",
  kind: "resume",
  blocks: [
    { type: "header", name: "[Your Full Name]", contactLines: [CONTACT, VISA] },
    { type: "heading", text: "PROFESSIONAL SUMMARY" },
    {
      type: "paragraph",
      text: "Friendly and reliable hospitality worker with experience in fast-paced venues. Strong customer service, teamwork and cash-handling skills. Available for immediate start, flexible hours including weekends.",
    },
    { type: "heading", text: "CERTIFICATIONS" },
    { type: "bullets", items: ["Responsible Service of Alcohol (RSA) – [State]", "Food Safety / Barista course (if any)"] },
    { type: "heading", text: "SKILLS" },
    {
      type: "bullets",
      items: [
        "Customer service and table service",
        "POS / cash handling",
        "Coffee making (specify machine, if any)",
        "Basic food preparation and cleaning",
      ],
    },
    { type: "heading", text: "WORK EXPERIENCE" },
    { type: "lines", lines: ["[Job Title] – [Venue], [City] ([Month Year] – [Month Year])"] },
    {
      type: "bullets",
      items: [
        "Served customers and processed payments accurately.",
        "Maintained clean and safe work areas to health standards.",
      ],
    },
    { type: "heading", text: "EDUCATION" },
    { type: "lines", lines: ["[Course / School], [Year]"] },
    { type: "heading", text: "AVAILABILITY" },
    { type: "lines", lines: ["[Days / hours available]"] },
    { type: "heading", text: "REFERENCES" },
    { type: "paragraph", text: "Available on request." },
  ],
};

const FARM: StructuredDoc = {
  id: "farm",
  label: "ファーム・農作業",
  fileBaseName: "resume-farm",
  kind: "resume",
  blocks: [
    { type: "header", name: "[Your Full Name]", contactLines: [CONTACT, VISA] },
    { type: "heading", text: "PROFESSIONAL SUMMARY" },
    {
      type: "paragraph",
      text: "Hard-working and physically fit farm worker, comfortable with outdoor manual labour in all weather. Reliable, punctual and happy to work in regional areas. Available for immediate start, own transport: [Yes/No].",
    },
    { type: "heading", text: "SKILLS" },
    {
      type: "bullets",
      items: [
        "Fruit and vegetable picking / packing",
        "Working at speed (piece rate experience: [Yes/No])",
        "Following WHS and chemical safety instructions",
        "Manual handling and repetitive tasks",
      ],
    },
    { type: "heading", text: "WORK EXPERIENCE" },
    { type: "lines", lines: ["[Role] – [Farm / Employer], [Region] ([Month Year] – [Month Year])"] },
    {
      type: "bullets",
      items: ["Picked and packed [crop] to quality standards.", "Followed safety procedures in the field and shed."],
    },
    { type: "heading", text: "OTHER INFORMATION" },
    {
      type: "bullets",
      items: ["Location flexibility: willing to relocate to regional areas", "Driver licence: [Yes/No], Car: [Yes/No]"],
    },
    { type: "heading", text: "REFERENCES" },
    { type: "paragraph", text: "Available on request." },
  ],
};

const WAREHOUSE: StructuredDoc = {
  id: "warehouse",
  label: "倉庫・物流",
  fileBaseName: "resume-warehouse",
  kind: "resume",
  blocks: [
    { type: "header", name: "[Your Full Name]", contactLines: [CONTACT, VISA] },
    { type: "heading", text: "PROFESSIONAL SUMMARY" },
    {
      type: "paragraph",
      text: "Dependable warehouse and logistics worker with attention to detail and a strong safety focus. Comfortable with physical work, shifts and repetitive tasks. Available for immediate start.",
    },
    { type: "heading", text: "CERTIFICATIONS" },
    { type: "bullets", items: ["Forklift Licence (LF) – [if any]", "White Card – [if any]"] },
    { type: "heading", text: "SKILLS" },
    {
      type: "bullets",
      items: [
        "Picking, packing and dispatch",
        "Scanning / basic warehouse systems (RF scanner)",
        "Manual handling and stock control",
        "WHS awareness",
      ],
    },
    { type: "heading", text: "WORK EXPERIENCE" },
    { type: "lines", lines: ["[Role] – [Company], [City] ([Month Year] – [Month Year])"] },
    {
      type: "bullets",
      items: [
        "Picked and packed orders accurately to daily targets.",
        "Kept the work area clean and followed safety procedures.",
      ],
    },
    { type: "heading", text: "AVAILABILITY" },
    { type: "lines", lines: ["[Shifts / days available]"] },
    { type: "heading", text: "REFERENCES" },
    { type: "paragraph", text: "Available on request." },
  ],
};

const IT: StructuredDoc = {
  id: "it",
  label: "IT・専門職",
  fileBaseName: "resume-it",
  kind: "resume",
  blocks: [
    {
      type: "header",
      name: "[Your Full Name]",
      contactLines: ["[Suburb, State] | [Phone] | [Email] | [LinkedIn / GitHub]", VISA],
    },
    { type: "heading", text: "PROFESSIONAL SUMMARY" },
    {
      type: "paragraph",
      text: "[Role, e.g. Front-end Developer] with [X] years of experience building [what]. Strong in [key skills]. Seeking a role in Australia during a working holiday.",
    },
    { type: "heading", text: "TECHNICAL SKILLS" },
    {
      type: "bullets",
      items: [
        "Languages: [e.g. JavaScript, TypeScript, Python]",
        "Frameworks/Tools: [e.g. React, Node.js, Git]",
        "Other: [databases, cloud, testing]",
      ],
    },
    { type: "heading", text: "WORK EXPERIENCE" },
    { type: "lines", lines: ["[Job Title] – [Company], [Location] ([Month Year] – [Month Year])"] },
    {
      type: "bullets",
      items: ['[Achievement with impact, e.g. "Built X, reducing Y by Z%"].', "[Responsibility / technology used]."],
    },
    { type: "heading", text: "PROJECTS (OPTIONAL)" },
    { type: "lines", lines: ["[Project name] – [Short description and link]"] },
    { type: "heading", text: "EDUCATION" },
    { type: "lines", lines: ["[Degree / Course], [School], [Year]"] },
    { type: "heading", text: "REFERENCES" },
    { type: "paragraph", text: "Available on request." },
  ],
};

export const RESUME_TEMPLATES: StructuredDoc[] = [HOSPITALITY, FARM, WAREHOUSE, IT];
